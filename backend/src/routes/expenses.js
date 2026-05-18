const router = require('express').Router();
const auth = require('../middleware/auth');
const expenseModel = require('../models/expenseModel');
const { matchOrCreateCategory } = require('../services/categoryService');
const db = require('../db/database');
const { currentYearMonth } = require('../utils/dateUtils');

function invalidateInsightCache(userId, dates = []) {
  const months = new Set([currentYearMonth()]);
  for (const d of dates) {
    if (d) months.add(d.slice(0, 7));
  }
  const stmt = db.prepare('DELETE FROM monthly_insights WHERE user_id = ? AND year_month = ?');
  for (const ym of months) stmt.run(userId, ym);
}

router.get('/', auth, (req, res) => {
  const { startDate, endDate, categoryIds, subcategoryIds, minAmount, maxAmount,
    search, tags, sortBy, sortDir, limit, offset } = req.query;

  const filters = {
    startDate, endDate,
    categoryIds: categoryIds ? String(categoryIds).split(',').map(Number) : undefined,
    subcategoryIds: subcategoryIds ? String(subcategoryIds).split(',').map(Number) : undefined,
    minAmount, maxAmount, search, tags, sortBy, sortDir, limit, offset,
  };
  res.json(expenseModel.findByUser(req.user.userId, filters));
});

router.post('/', auth, (req, res, next) => {
  try {
    const { expenses } = req.body;
    if (!Array.isArray(expenses) || !expenses.length) {
      return res.status(400).json({ error: 'expenses array required' });
    }

    const resolved = expenses.map(e => {
      const { category_id, subcategory_id } = matchOrCreateCategory(
        req.user.userId, e.category, e.subcategory
      );
      return { ...e, category_id, subcategory_id };
    });

    const ids = expenseModel.insertMany(req.user.userId, resolved);
    const created = ids.map(id => expenseModel.findById(id, req.user.userId));

    invalidateInsightCache(req.user.userId, resolved.map(e => e.date));
    res.status(201).json({ created });
  } catch (err) { next(err); }
});

router.put('/:id', auth, (req, res, next) => {
  try {
    const { category, subcategory, ...fields } = req.body;
    if (category) {
      const { category_id, subcategory_id } = matchOrCreateCategory(
        req.user.userId, category, subcategory
      );
      fields.category_id = category_id;
      fields.subcategory_id = subcategory_id;
    }
    const expense = expenseModel.update(req.params.id, req.user.userId, fields);
    if (!expense) return res.status(404).json({ error: 'Not found' });

    invalidateInsightCache(req.user.userId, [expense.date, fields.date]);
    res.json({ expense });
  } catch (err) { next(err); }
});

router.delete('/bulk', auth, (req, res, next) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids array required' });
    expenseModel.bulkRemove(ids, req.user.userId);
    invalidateInsightCache(req.user.userId);
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.delete('/:id', auth, (req, res) => {
  const result = expenseModel.remove(req.params.id, req.user.userId);
  if (!result.changes) return res.status(404).json({ error: 'Not found' });
  invalidateInsightCache(req.user.userId);
  res.json({ success: true });
});

module.exports = router;
