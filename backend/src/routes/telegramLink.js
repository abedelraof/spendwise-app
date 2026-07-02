const router = require('express').Router();
const crypto = require('crypto');
const auth = require('../middleware/auth');
const { query, queryOne, execute } = require('../db/database');

const CODE_TTL_MS = 10 * 60 * 1000;

function generateCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

router.get('/', auth, async (req, res, next) => {
  try {
    const link = await queryOne('SELECT chat_id, linked_at FROM telegram_links WHERE user_id = $1', [req.user.userId]);
    res.json({ linked: !!link, linked_at: link?.linked_at ?? null });
  } catch (err) { next(err); }
});

router.post('/', auth, async (req, res, next) => {
  try {
    const code = generateCode();
    const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();

    await execute(
      `INSERT INTO telegram_link_codes (user_id, code, expires_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET code = EXCLUDED.code, expires_at = EXCLUDED.expires_at, created_at = NOW()`,
      [req.user.userId, code, expiresAt]
    );

    const botUsername = process.env.TELEGRAM_BOT_USERNAME;
    res.json({
      code,
      expires_at: expiresAt,
      deep_link: botUsername ? `https://t.me/${botUsername}?start=${code}` : null,
    });
  } catch (err) { next(err); }
});

router.delete('/', auth, async (req, res, next) => {
  try {
    await execute('DELETE FROM telegram_links WHERE user_id = $1', [req.user.userId]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
