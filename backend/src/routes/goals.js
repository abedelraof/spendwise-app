const router = require('express').Router();
const auth   = require('../middleware/auth');
const db     = require('../db/database');

const GOAL_SQL = `
  SELECT g.*,
    a.name AS account_name, a.currency AS account_currency,
    ab.balance AS latest_balance
  FROM savings_goals g
  LEFT JOIN accounts a ON a.id = g.account_id
  LEFT JOIN account_balances ab ON ab.id = (
    SELECT id FROM account_balances
    WHERE account_id = g.account_id
    ORDER BY recorded_date DESC, created_at DESC LIMIT 1
  )
  WHERE g.user_id = ?
  ORDER BY g.created_at
`;

const list = (userId) => db.prepare(GOAL_SQL).all(userId);

router.get('/', auth, (req, res) => {
  res.json({ goals: list(req.user.userId) });
});

router.post('/', auth, (req, res, next) => {
  try {
    const { name, icon = '🎯', target_amount, target_currency = 'EGP',
            account_id = null, current_amount = 0, target_date = null } = req.body;
    if (!name?.trim())             return res.status(400).json({ error: 'name is required' });
    if (!(target_amount > 0))      return res.status(400).json({ error: 'target_amount must be positive' });
    db.prepare(`
      INSERT INTO savings_goals (user_id, account_id, name, icon, target_amount, target_currency, current_amount, target_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.user.userId, account_id, name.trim(), icon, target_amount, target_currency, current_amount, target_date);
    res.status(201).json({ goals: list(req.user.userId) });
  } catch (err) { next(err); }
});

router.put('/:id', auth, (req, res, next) => {
  try {
    const { name, icon, target_amount, target_currency, account_id, current_amount, target_date } = req.body;
    const fields = []; const vals = [];
    if (name            !== undefined) { fields.push('name = ?');            vals.push(name.trim()); }
    if (icon            !== undefined) { fields.push('icon = ?');            vals.push(icon); }
    if (target_amount   !== undefined) { fields.push('target_amount = ?');   vals.push(target_amount); }
    if (target_currency !== undefined) { fields.push('target_currency = ?'); vals.push(target_currency); }
    if (account_id      !== undefined) { fields.push('account_id = ?');      vals.push(account_id); }
    if (current_amount  !== undefined) { fields.push('current_amount = ?');  vals.push(current_amount); }
    if (target_date     !== undefined) { fields.push('target_date = ?');     vals.push(target_date ?? null); }
    if (fields.length) {
      vals.push(req.params.id, req.user.userId);
      db.prepare(`UPDATE savings_goals SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`).run(...vals);
    }
    res.json({ goals: list(req.user.userId) });
  } catch (err) { next(err); }
});

router.delete('/:id', auth, (req, res) => {
  db.prepare('DELETE FROM savings_goals WHERE id = ? AND user_id = ?').run(req.params.id, req.user.userId);
  res.json({ success: true });
});

module.exports = router;
