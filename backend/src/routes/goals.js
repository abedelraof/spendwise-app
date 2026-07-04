const router = require('express').Router();
const auth   = require('../middleware/auth');
const { execute } = require('../db/database');
const goalModel = require('../models/goalModel');

const list = goalModel.findByUser;

router.get('/', auth, async (req, res, next) => {
  try {
    res.json({ goals: await list(req.user.userId) });
  } catch (err) { next(err); }
});

router.post('/', auth, async (req, res, next) => {
  try {
    const { name, icon = '🎯', target_amount, target_currency = 'EGP',
            account_id = null, current_amount = 0, target_date = null } = req.body;
    if (!name?.trim())        return res.status(400).json({ error: 'name is required' });
    if (!(target_amount > 0)) return res.status(400).json({ error: 'target_amount must be positive' });
    await execute(
      `INSERT INTO savings_goals (user_id, account_id, name, icon, target_amount, target_currency, current_amount, target_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [req.user.userId, account_id, name.trim(), icon, target_amount, target_currency, current_amount, target_date]
    );
    res.status(201).json({ goals: await list(req.user.userId) });
  } catch (err) { next(err); }
});

router.put('/:id', auth, async (req, res, next) => {
  try {
    const { name, icon, target_amount, target_currency, account_id, current_amount, target_date } = req.body;
    const fields = []; const vals = []; let idx = 1;
    if (name            !== undefined) { fields.push(`name = $${idx++}`);            vals.push(name.trim()); }
    if (icon            !== undefined) { fields.push(`icon = $${idx++}`);            vals.push(icon); }
    if (target_amount   !== undefined) { fields.push(`target_amount = $${idx++}`);   vals.push(target_amount); }
    if (target_currency !== undefined) { fields.push(`target_currency = $${idx++}`); vals.push(target_currency); }
    if (account_id      !== undefined) { fields.push(`account_id = $${idx++}`);      vals.push(account_id); }
    if (current_amount  !== undefined) { fields.push(`current_amount = $${idx++}`);  vals.push(current_amount); }
    if (target_date     !== undefined) { fields.push(`target_date = $${idx++}`);     vals.push(target_date ?? null); }
    if (fields.length) {
      vals.push(req.params.id, req.user.userId);
      await execute(
        `UPDATE savings_goals SET ${fields.join(', ')} WHERE id = $${idx++} AND user_id = $${idx}`,
        vals
      );
    }
    res.json({ goals: await list(req.user.userId) });
  } catch (err) { next(err); }
});

router.delete('/:id', auth, async (req, res, next) => {
  try {
    await execute('DELETE FROM savings_goals WHERE id = $1 AND user_id = $2', [req.params.id, req.user.userId]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
