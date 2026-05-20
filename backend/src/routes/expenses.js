const router = require('express').Router();
const auth = require('../middleware/auth');
const expenseModel = require('../models/expenseModel');
const { matchOrCreateCategory } = require('../services/categoryService');
const { execute } = require('../db/database');
const { currentYearMonth } = require('../utils/dateUtils');

async function invalidateInsightCache(userId, dates = []) {
  const months = new Set([currentYearMonth()]);
  for (const d of dates) { if (d) months.add(d.slice(0, 7)); }
  for (const ym of months) {
    await execute('DELETE FROM monthly_insights WHERE user_id = $1 AND year_month = $2', [userId, ym]);
  }
}

router.get('/', auth, async (req, res, next) => {
  try {
    const { startDate, endDate, categoryIds, subcategoryIds, minAmount, maxAmount,
      search, tags, sortBy, sortDir, limit, offset } = req.query;
    const filters = {
      startDate, endDate,
      categoryIds: categoryIds ? String(categoryIds).split(',').map(Number) : undefined,
      subcategoryIds: subcategoryIds ? String(subcategoryIds).split(',').map(Number) : undefined,
      minAmount, maxAmount, search, tags, sortBy, sortDir, limit, offset,
    };
    res.json(await expenseModel.findByUser(req.user.userId, filters));
  } catch (err) { next(err); }
});

router.post('/', auth, async (req, res, next) => {
  try {
    const { expenses } = req.body;
    if (!Array.isArray(expenses) || !expenses.length)
      return res.status(400).json({ error: 'expenses array required' });

    const resolved = await Promise.all(expenses.map(async e => {
      const { category_id, subcategory_id } = await matchOrCreateCategory(
        req.user.userId, e.category, e.subcategory
      );
      return { ...e, category_id, subcategory_id };
    }));

    const ids = await expenseModel.insertMany(req.user.userId, resolved);
    const created = await Promise.all(ids.map(id => expenseModel.findById(id, req.user.userId)));

    await invalidateInsightCache(req.user.userId, resolved.map(e => e.date));
    res.status(201).json({ created });
  } catch (err) { next(err); }
});

router.put('/:id', auth, async (req, res, next) => {
  try {
    const { category, subcategory, ...fields } = req.body;
    if (category) {
      const { category_id, subcategory_id } = await matchOrCreateCategory(
        req.user.userId, category, subcategory
      );
      fields.category_id = category_id;
      fields.subcategory_id = subcategory_id;
    }
    const expense = await expenseModel.update(req.params.id, req.user.userId, fields);
    if (!expense) return res.status(404).json({ error: 'Not found' });

    await invalidateInsightCache(req.user.userId, [expense.date, fields.date]);
    res.json({ expense });
  } catch (err) { next(err); }
});

router.delete('/bulk', auth, async (req, res, next) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids array required' });
    await expenseModel.bulkRemove(ids, req.user.userId);
    await invalidateInsightCache(req.user.userId);
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.delete('/:id', auth, async (req, res, next) => {
  try {
    const result = await expenseModel.remove(req.params.id, req.user.userId);
    if (!result.rowCount) return res.status(404).json({ error: 'Not found' });
    await invalidateInsightCache(req.user.userId);
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
