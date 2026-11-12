const router = require('express').Router();
const { queryOne, execute } = require('../db/database');
const { ingestSms } = require('../services/pendingService');

// Public, token-authenticated receivers for phone automations (Tasker, MacroDroid,
// iOS Shortcuts, SMS-forwarder apps...). No JWT — the secret path token identifies
// the user, so these routes must never reveal whether a token exists beyond a 404.

// Every accepted call costs a Claude request, so a runaway automation or a leaked
// link must not be able to run up the bill. In-memory is enough: it only needs to
// bound bursts, and a restart resetting the window is harmless.
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 60;
const hits = new Map(); // userId -> [timestamps]

function rateLimited(userId) {
  const now = Date.now();
  const recent = (hits.get(userId) || []).filter(t => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) { hits.set(userId, recent); return true; }
  recent.push(now);
  hits.set(userId, recent);
  return false;
}

// Different automation apps name the variable differently.
const MESSAGE_PARAMS = ['msg', 'message', 'text', 'body', 'sms'];
const pickMessage = (query) => {
  for (const key of MESSAGE_PARAMS) {
    if (typeof query[key] === 'string' && query[key].trim()) return query[key];
  }
  return null;
};

router.get('/sms/:token', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const { token } = req.params;
    const hook = /^[A-Za-z0-9_-]{20,64}$/.test(token)
      ? await queryOne('SELECT user_id FROM sms_webhooks WHERE token = $1', [token])
      : null;
    if (!hook) return res.status(404).json({ error: 'Not found' });

    const message = pickMessage(req.query);
    if (!message) return res.status(400).json({ error: 'Missing "msg" query parameter' });

    if (rateLimited(hook.user_id)) {
      res.set('Retry-After', '600');
      return res.status(429).json({ error: 'Too many messages — slow down' });
    }

    await execute('UPDATE sms_webhooks SET last_used_at = NOW() WHERE user_id = $1', [hook.user_id]);

    const result = await ingestSms(hook.user_id, message);
    res.json(result.status === 'pending'
      ? { status: 'pending', id: result.pending.id }
      : result);
  } catch (err) {
    // The AI call (or DB) failed. Say so plainly so the automation can retry,
    // without echoing internal error text to a public endpoint.
    console.error('[sms-webhook]', err.message);
    res.status(502).json({ error: 'Could not process the message right now' });
  }
});

module.exports = router;
