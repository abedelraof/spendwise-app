const router = require('express').Router();
const bcrypt = require('bcryptjs');
const auth = require('../middleware/auth');
const userModel = require('../models/userModel');
const { encrypt } = require('../services/cryptoService');
const { execute, pool } = require('../db/database');

router.get('/', auth, async (req, res, next) => {
  try {
    const user = await userModel.findById(req.user.userId);
    res.json({
      currency:          user.currency,
      accounts_currency: user.accounts_currency ?? null,
      theme:             user.theme,
      hasApiKey:         !!user.claude_api_key,
      hasPin:            !!user.pin_hash,
    });
  } catch (err) { next(err); }
});

router.put('/', auth, async (req, res, next) => {
  try {
    const { currency, claudeApiKey, theme, accounts_currency } = req.body;
    const updates = {};
    if (currency)                        updates.currency         = currency;
    if (theme)                           updates.theme            = theme;
    if (claudeApiKey)                    updates.claudeApiKey     = encrypt(claudeApiKey);
    if (accounts_currency !== undefined) updates.accountsCurrency = accounts_currency || null;
    await userModel.updateSettings(req.user.userId, updates);

    const user = await userModel.findById(req.user.userId);
    res.json({
      currency:          user.currency,
      accounts_currency: user.accounts_currency ?? null,
      theme:             user.theme,
      hasApiKey:         !!user.claude_api_key,
    });
  } catch (err) { next(err); }
});

router.post('/clear-data', auth, async (req, res, next) => {
  try {
    const { pin } = req.body;
    if (!pin || String(pin).trim().length < 4) {
      return res.status(400).json({ error: 'PIN must be at least 4 characters' });
    }
    const userId = req.user.userId;
    const user = await userModel.findById(userId);

    if (user.pin_hash) {
      const match = await bcrypt.compare(String(pin), user.pin_hash);
      if (!match) return res.status(403).json({ error: 'Incorrect PIN' });
    } else {
      const hash = await bcrypt.hash(String(pin), 10);
      await userModel.updateSettings(userId, { pinHash: hash });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM expenses           WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM incomes            WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM budgets            WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM recurring_expenses WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM monthly_insights   WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM savings_goals      WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM accounts           WHERE user_id = $1', [userId]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
