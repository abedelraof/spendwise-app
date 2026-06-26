const router = require('express').Router();
const jwt = require('jsonwebtoken');
const auth = require('../middleware/auth');
const { query, execute } = require('../db/database');
const userModel = require('../models/userModel');

const PACKAGE_NAME = process.env.GOOGLE_PLAY_PACKAGE || 'com.expensebeam.expensebeam_mobile';
const SUBSCRIPTION_ID = process.env.GOOGLE_PLAY_SUBSCRIPTION_ID || 'expensebeam_pro_monthly';
const AI_LIMIT_PRO = 100;

function getResetDate() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 10);
}

function buildSubscriptionResponse(user) {
  const isPro = user.plan === 'pro';
  return {
    plan:       user.plan,
    ai_used:    user.ai_used_this_month ?? 0,
    ai_limit:   isPro ? AI_LIMIT_PRO : 0,
    reset_date: user.ai_quota_reset_date ?? getResetDate(),
  };
}

async function getGoogleAccessToken() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not configured');
  const sa = JSON.parse(raw);

  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign(
    {
      iss:   sa.client_email,
      scope: 'https://www.googleapis.com/auth/androidpublisher',
      aud:   'https://oauth2.googleapis.com/token',
      iat:   now,
      exp:   now + 3600,
    },
    sa.private_key,
    { algorithm: 'RS256' }
  );

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const data = await resp.json();
  if (!data.access_token) throw new Error('Failed to get Google access token');
  return data.access_token;
}

async function verifyGooglePlayPurchase(purchaseToken) {
  const accessToken = await getGoogleAccessToken();
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE_NAME}/purchases/subscriptions/${SUBSCRIPTION_ID}/tokens/${purchaseToken}`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw Object.assign(new Error('Google Play API error'), { status: resp.status, details: err });
  }
  return resp.json();
}

// GET /api/subscription
router.get('/', auth, async (req, res, next) => {
  try {
    const user = await userModel.findById(req.user.userId);
    if (!user) return res.status(401).json({ error: 'User not found' });
    res.json(buildSubscriptionResponse(user));
  } catch (err) { next(err); }
});

// POST /api/subscription/verify
router.post('/verify', auth, async (req, res, next) => {
  try {
    const { purchase_token, product_id, platform } = req.body;
    if (!purchase_token || !product_id || !platform) {
      return res.status(400).json({ error: 'purchase_token, product_id and platform are required' });
    }

    // Check if token already used by another user
    const existing = await query(
      `SELECT id FROM users WHERE play_purchase_token = $1 AND id != $2`,
      [purchase_token, req.user.userId]
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Purchase token already linked to another account' });
    }

    let expiryMs;
    try {
      const playData = await verifyGooglePlayPurchase(purchase_token);
      if (playData.paymentState !== 1) {
        return res.status(402).json({ error: 'Payment not received' });
      }
      expiryMs = parseInt(playData.expiryTimeMillis, 10);
      if (expiryMs <= Date.now()) {
        return res.status(402).json({ error: 'Subscription has already expired' });
      }
    } catch (err) {
      if (err.status) {
        return res.status(402).json({ error: 'Google Play validation failed', details: err.details });
      }
      throw err;
    }

    const expiryDate = new Date(expiryMs).toISOString();
    const resetDate = getResetDate();

    await execute(
      `UPDATE users SET
         plan                = 'pro',
         play_purchase_token = $1,
         subscription_expiry = $2,
         ai_quota_reset_date = $3
       WHERE id = $4`,
      [purchase_token, expiryDate, resetDate, req.user.userId]
    );

    const user = await userModel.findById(req.user.userId);
    res.json(buildSubscriptionResponse(user));
  } catch (err) { next(err); }
});

module.exports = router;
