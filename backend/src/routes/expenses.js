const router = require('express').Router();
const auth = require('../middleware/auth');
const expenseModel = require('../models/expenseModel');
const { matchOrCreateCategory } = require('../services/categoryService');
const { createExpenses, invalidateInsightCache } = require('../services/expenseService');
const bucketModel = require('../models/bucketModel');

router.get('/', auth, async (req, res, next) => {
  try {
    const { startDate, endDate, categoryIds, subcategoryIds, bucketIds, minAmount, maxAmount,
      search, tags, sortBy, sortDir, limit, offset } = req.query;
    const filters = {
      startDate, endDate,
      categoryIds: categoryIds ? String(categoryIds).split(',').map(Number) : undefined,
      subcategoryIds: subcategoryIds ? String(subcategoryIds).split(',').map(Number) : undefined,
      bucketIds: bucketIds ? String(bucketIds).split(',').map(Number) : undefined,
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

    const created = await createExpenses(req.user.userId, expenses);
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

// Replace an expense's bucket assignments. Used by the Transactions edit modal
// and the Buckets "Assign" screen's per-row Save.
router.put('/:id/buckets', auth, async (req, res, next) => {
  try {
    const { bucketIds } = req.body;
    if (!Array.isArray(bucketIds)) return res.status(400).json({ error: 'bucketIds array required' });
    const ok = await bucketModel.setExpenseBuckets(req.user.userId, req.params.id, bucketIds);
    if (!ok) return res.status(404).json({ error: 'Not found' });
    res.json({ expense: await expenseModel.findById(req.params.id, req.user.userId) });
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

// ID-based batch delete for the AI delete_intent flow: the client resolves and
// pins the exact ids itself (via GET /expenses) before ever calling this, so
// partial failures are reported back rather than thrown as an error.
router.delete('/batch', auth, async (req, res, next) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || !ids.length || ids.length > 500) {
      return res.status(400).json({ error: 'ids array required (1-500 items)' });
    }

    const numericIds = [];
    const failed_ids = [];
    for (const id of ids) {
      const n = Number(id);
      if (Number.isInteger(n)) numericIds.push(n); else failed_ids.push(String(id));
    }

    const deletedIds = numericIds.length ? await expenseModel.removeMany(numericIds, req.user.userId) : [];
    const deletedSet = new Set(deletedIds);
    for (const id of numericIds) {
      if (!deletedSet.has(id)) failed_ids.push(String(id));
    }

    if (deletedIds.length) await invalidateInsightCache(req.user.userId);
    res.json({ deleted_count: deletedIds.length, failed_ids });
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
