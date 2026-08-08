const router = require('express').Router();
const auth = require('../middleware/auth');
const { query, execute, pool } = require('../db/database');
const expenseService = require('../services/expenseService');
const expenseModel = require('../models/expenseModel');
const { getMonthRange, todayISO } = require('../utils/dateUtils');

// Buckets plus a month-to-date rollup (spent + expense_count) so the list has
// numbers without a second round-trip. LEFT JOIN keeps buckets with no expenses.
async function listWithStats(userId) {
  const now = new Date();
  const { start, end } = getMonthRange(now.getFullYear(), now.getMonth() + 1);
  return query(
    `SELECT b.*,
       COALESCE(SUM(e.amount * e.exchange_rate), 0)::float AS spent,
       COUNT(DISTINCT e.id)::int AS expense_count
     FROM buckets b
     LEFT JOIN expense_buckets eb ON eb.bucket_id = b.id
     LEFT JOIN expenses e ON e.id = eb.expense_id AND e.date BETWEEN $2 AND $3
     WHERE b.user_id = $1
     GROUP BY b.id
     ORDER BY b.sort_order ASC, b.created_at ASC`,
    [userId, start, end]
  );
}

// GET / — buckets with month-to-date spend
router.get('/', auth, async (req, res, next) => {
  try {
    res.json({ buckets: await listWithStats(req.user.userId) });
  } catch (err) { next(err); }
});

// GET /breakdown — ranked per-bucket totals for a date range (bar chart)
router.get('/breakdown', auth, async (req, res, next) => {
  try {
    const now = new Date();
    const { start } = getMonthRange(now.getFullYear(), now.getMonth() + 1);
    const { startDate = start, endDate = todayISO() } = req.query;
    res.json({ data: await expenseService.getBucketBreakdown(req.user.userId, startDate, endDate) });
  } catch (err) { next(err); }
});

// POST / — create bucket
router.post('/', auth, async (req, res, next) => {
  try {
    const { name, icon = '🪣', color = '#7c3aed', target_amount = null, target_currency = null } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    try {
      await execute(
        `INSERT INTO buckets (user_id, name, icon, color, target_amount, target_currency)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [req.user.userId, name.trim(), icon, color, target_amount, target_currency]
      );
    } catch (e) {
      if (e.code === '23505') return res.status(400).json({ error: 'A bucket with that name already exists' });
      throw e;
    }
    res.status(201).json({ buckets: await listWithStats(req.user.userId) });
  } catch (err) { next(err); }
});

// PUT /reorder — registered before /:id so Express doesn't match "reorder" as an id
router.put('/reorder', auth, async (req, res, next) => {
  try {
    const { order } = req.body;
    if (!Array.isArray(order) || !order.length) return res.status(400).json({ error: 'order array required' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const { id, sort_order } of order) {
        await client.query('UPDATE buckets SET sort_order = $1 WHERE id = $2 AND user_id = $3',
          [sort_order, id, req.user.userId]);
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    res.json({ success: true });
  } catch (err) { next(err); }
});

// GET /:id/trend — per-day totals for one bucket (line chart)
router.get('/:id/trend', auth, async (req, res, next) => {
  try {
    const now = new Date();
    const { start } = getMonthRange(now.getFullYear(), now.getMonth() + 1);
    const { startDate = start, endDate = todayISO() } = req.query;
    res.json({ data: await expenseService.getBucketTrend(req.user.userId, startDate, endDate, req.params.id) });
  } catch (err) { next(err); }
});

// GET /:id/expenses — that bucket's expenses in a date range (drill-down)
router.get('/:id/expenses', auth, async (req, res, next) => {
  try {
    const now = new Date();
    const { start } = getMonthRange(now.getFullYear(), now.getMonth() + 1);
    const { startDate = start, endDate = todayISO() } = req.query;
    const expenses = await expenseModel.findAll(req.user.userId, {
      startDate, endDate, bucketIds: [Number(req.params.id)],
    });
    res.json({ expenses });
  } catch (err) { next(err); }
});

// PUT /:id — partial update
router.put('/:id', auth, async (req, res, next) => {
  try {
    const { name, icon, color, target_amount, target_currency } = req.body;
    const fields = []; const vals = []; let idx = 1;
    if (name !== undefined)            { fields.push(`name = $${idx++}`);            vals.push(name.trim()); }
    if (icon !== undefined)            { fields.push(`icon = $${idx++}`);            vals.push(icon); }
    if (color !== undefined)           { fields.push(`color = $${idx++}`);           vals.push(color); }
    if (target_amount !== undefined)   { fields.push(`target_amount = $${idx++}`);   vals.push(target_amount); }
    if (target_currency !== undefined) { fields.push(`target_currency = $${idx++}`); vals.push(target_currency); }
    if (fields.length) {
      vals.push(req.params.id, req.user.userId);
      try {
        await execute(`UPDATE buckets SET ${fields.join(', ')} WHERE id = $${idx++} AND user_id = $${idx}`, vals);
      } catch (e) {
        if (e.code === '23505') return res.status(400).json({ error: 'A bucket with that name already exists' });
        throw e;
      }
    }
    res.json({ buckets: await listWithStats(req.user.userId) });
  } catch (err) { next(err); }
});

// DELETE /:id — join rows cascade via FK
router.delete('/:id', auth, async (req, res, next) => {
  try {
    await execute('DELETE FROM buckets WHERE id = $1 AND user_id = $2', [req.params.id, req.user.userId]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
