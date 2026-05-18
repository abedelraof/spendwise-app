const router = require('express').Router();
const auth = require('../middleware/auth');
const db = require('../db/database');
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

router.get('/', auth, (req, res) => {
  const rows = db.prepare(`${SELECT} WHERE r.user_id = ? ORDER BY r.next_due_date`).all(req.user.userId);
  res.json({ recurring: rows });
});

router.post('/', auth, (req, res, next) => {
  try {
    const { amount, currency, exchangeRate = 1.0, category, subcategory,
      description, tags, interval, nextDueDate } = req.body;
    if (!amount || !interval || !nextDueDate) {
      return res.status(400).json({ error: 'amount, interval, and nextDueDate are required' });
    }
    const { category_id, subcategory_id } = matchOrCreateCategory(req.user.userId, category, subcategory);
    db.prepare(`
      INSERT INTO recurring_expenses (user_id, amount, currency, exchange_rate, category_id, subcategory_id,
        description, tags, interval_type, next_due_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.user.userId, amount, currency || 'EGP', exchangeRate, category_id, subcategory_id,
      description, tags, interval, nextDueDate);
    const rows = db.prepare(`${SELECT} WHERE r.user_id = ? ORDER BY r.next_due_date`).all(req.user.userId);
    res.status(201).json({ recurring: rows });
  } catch (err) { next(err); }
});

router.put('/:id', auth, (req, res, next) => {
  try {
    const { amount, currency, description, tags, interval, nextDueDate } = req.body;
    const fields = [];
    const vals = [];
    if (amount !== undefined) { fields.push('amount = ?'); vals.push(amount); }
    if (currency) { fields.push('currency = ?'); vals.push(currency); }
    if (description !== undefined) { fields.push('description = ?'); vals.push(description); }
    if (tags !== undefined) { fields.push('tags = ?'); vals.push(tags); }
    if (interval) { fields.push('interval_type = ?'); vals.push(interval); }
    if (nextDueDate) { fields.push('next_due_date = ?'); vals.push(nextDueDate); }
    if (fields.length) {
      vals.push(req.params.id, req.user.userId);
      db.prepare(`UPDATE recurring_expenses SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`).run(...vals);
    }
    const rows = db.prepare(`${SELECT} WHERE r.user_id = ? ORDER BY r.next_due_date`).all(req.user.userId);
    res.json({ recurring: rows });
  } catch (err) { next(err); }
});

router.delete('/:id', auth, (req, res) => {
  db.prepare('DELETE FROM recurring_expenses WHERE id = ? AND user_id = ?').run(req.params.id, req.user.userId);
  res.json({ success: true });
});

module.exports = router;
