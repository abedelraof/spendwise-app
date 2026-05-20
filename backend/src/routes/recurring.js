const router = require('express').Router();
const auth = require('../middleware/auth');
const { query, execute } = require('../db/database');
const { matchOrCreateCategory } = require('../services/categoryService');
const { todayISO } = require('../utils/dateUtils');

const SELECT = `
  SELECT r.*,
    c.name AS category_name, c.icon AS category_icon, c.color AS category_color,
    s.name AS subcategory_name
  FROM recurring_expenses r
  LEFT JOIN categories c ON r.category_id = c.id
  LEFT JOIN subcategories s ON r.subcategory_id = s.id
`;

router.get('/', auth, async (req, res, next) => {
  try {
    const rows = await query(`${SELECT} WHERE r.user_id = $1 ORDER BY r.next_due_date`, [req.user.userId]);
    res.json({ recurring: rows });
  } catch (err) { next(err); }
});

router.post('/', auth, async (req, res, next) => {
  try {
    const { amount, currency, exchangeRate = 1.0, category, subcategory,
      description, tags, interval, nextDueDate } = req.body;
    if (!amount || !interval || !nextDueDate)
      return res.status(400).json({ error: 'amount, interval, and nextDueDate are required' });

    const { category_id, subcategory_id } = await matchOrCreateCategory(req.user.userId, category, subcategory);
    await execute(
      `INSERT INTO recurring_expenses
         (user_id, amount, currency, exchange_rate, category_id, subcategory_id,
          description, tags, interval_type, next_due_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [req.user.userId, amount, currency || 'EGP', exchangeRate,
       category_id, subcategory_id, description, tags, interval, nextDueDate]
    );
    const rows = await query(`${SELECT} WHERE r.user_id = $1 ORDER BY r.next_due_date`, [req.user.userId]);
    res.status(201).json({ recurring: rows });
  } catch (err) { next(err); }
});

router.put('/:id', auth, async (req, res, next) => {
  try {
    const { amount, currency, description, tags, interval, nextDueDate } = req.body;
    const fields = []; const vals = []; let idx = 1;
    if (amount      !== undefined) { fields.push(`amount = $${idx++}`);        vals.push(amount); }
    if (currency)                  { fields.push(`currency = $${idx++}`);      vals.push(currency); }
    if (description !== undefined) { fields.push(`description = $${idx++}`);   vals.push(description); }
    if (tags        !== undefined) { fields.push(`tags = $${idx++}`);          vals.push(tags); }
    if (interval)                  { fields.push(`interval_type = $${idx++}`); vals.push(interval); }
    if (nextDueDate)               { fields.push(`next_due_date = $${idx++}`); vals.push(nextDueDate); }
    if (fields.length) {
      vals.push(req.params.id, req.user.userId);
      await execute(
        `UPDATE recurring_expenses SET ${fields.join(', ')} WHERE id = $${idx++} AND user_id = $${idx}`,
        vals
      );
    }
    const rows = await query(`${SELECT} WHERE r.user_id = $1 ORDER BY r.next_due_date`, [req.user.userId]);
    res.json({ recurring: rows });
  } catch (err) { next(err); }
});

router.delete('/:id', auth, async (req, res, next) => {
  try {
    await execute('DELETE FROM recurring_expenses WHERE id = $1 AND user_id = $2', [req.params.id, req.user.userId]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
