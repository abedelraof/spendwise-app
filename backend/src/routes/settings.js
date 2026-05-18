const router = require('express').Router();
const bcrypt = require('bcryptjs');
const auth = require('../middleware/auth');
const userModel = require('../models/userModel');
const { encrypt } = require('../services/cryptoService');
const db = require('../db/database');

router.get('/', auth, (req, res) => {
  const user = userModel.findById(req.user.userId);
  res.json({
    currency:          user.currency,
    accounts_currency: user.accounts_currency ?? null,
    theme:             user.theme,
    hasApiKey:         !!user.claude_api_key,
    hasPin:            !!user.pin_hash,
  });
});

router.put('/', auth, (req, res) => {
  const { currency, claudeApiKey, theme, accounts_currency } = req.body;
  const updates = {};
  if (currency)                        updates.currency         = currency;
  if (theme)                           updates.theme            = theme;
  if (claudeApiKey)                    updates.claudeApiKey     = encrypt(claudeApiKey);
  if (accounts_currency !== undefined) updates.accountsCurrency = accounts_currency || null;
  userModel.updateSettings(req.user.userId, updates);

  const user = userModel.findById(req.user.userId);
  res.json({
    currency:          user.currency,
    accounts_currency: user.accounts_currency ?? null,
    theme:             user.theme,
    hasApiKey:         !!user.claude_api_key,
  });
});

router.post('/clear-data', auth, async (req, res, next) => {
  try {
    const { pin } = req.body;
    if (!pin || String(pin).trim().length < 4) {
      return res.status(400).json({ error: 'PIN must be at least 4 characters' });
    }
    const user = userModel.findById(req.user.userId);
    const userId = req.user.userId;

    if (user.pin_hash) {
      // PIN already set — verify it
      const match = await bcrypt.compare(String(pin), user.pin_hash);
      if (!match) return res.status(403).json({ error: 'Incorrect PIN' });
    } else {
      // First time — save PIN
      const hash = await bcrypt.hash(String(pin), 10);
      userModel.updateSettings(userId, { pinHash: hash });
    }

    // Delete all financial data (keep user, categories, subcategories)
    db.transaction(() => {
      db.prepare('DELETE FROM expenses           WHERE user_id = ?').run(userId);
      db.prepare('DELETE FROM incomes            WHERE user_id = ?').run(userId);
      db.prepare('DELETE FROM budgets            WHERE user_id = ?').run(userId);
      db.prepare('DELETE FROM recurring_expenses WHERE user_id = ?').run(userId);
      db.prepare('DELETE FROM monthly_insights   WHERE user_id = ?').run(userId);
      db.prepare('DELETE FROM savings_goals      WHERE user_id = ?').run(userId);
      db.prepare('DELETE FROM accounts           WHERE user_id = ?').run(userId); // cascades account_balances
    })();

    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
