const router = require('express').Router();
const crypto = require('crypto');
const auth = require('../middleware/auth');
const { queryOne, execute } = require('../db/database');

// 192 bits of randomness, URL-safe. The token IS the credential for the public
// receiver (routes/hooks.js), so it is only ever shown to its owner.
const newToken = () => crypto.randomBytes(24).toString('base64url');

function describe(req, row) {
  if (!row) return { enabled: false };
  const base = process.env.DOMAIN
    ? `https://${process.env.DOMAIN}`
    : `${req.protocol}://${req.get('host')}`;
  const url = `${base}/api/hooks/sms/${row.token}`;
  return {
    enabled: true,
    url,
    template: `${url}?msg=`,
    created_at: row.created_at,
    last_used_at: row.last_used_at,
  };
}

router.get('/', auth, async (req, res, next) => {
  try {
    const row = await queryOne(
      'SELECT token, created_at, last_used_at FROM sms_webhooks WHERE user_id = $1',
      [req.user.userId]
    );
    res.json(describe(req, row));
  } catch (err) { next(err); }
});

// Opt in — or, if already opted in, rotate to a fresh link (the old one stops
// working immediately). Use this if the link leaks.
router.post('/', auth, async (req, res, next) => {
  try {
    const row = await queryOne(
      `INSERT INTO sms_webhooks (user_id, token) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE
         SET token = EXCLUDED.token, created_at = NOW(), last_used_at = NULL
       RETURNING token, created_at, last_used_at`,
      [req.user.userId, newToken()]
    );
    res.json(describe(req, row));
  } catch (err) { next(err); }
});

router.delete('/', auth, async (req, res, next) => {
  try {
    await execute('DELETE FROM sms_webhooks WHERE user_id = $1', [req.user.userId]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
