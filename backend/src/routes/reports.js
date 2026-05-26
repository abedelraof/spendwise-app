const router = require('express').Router();
const auth = require('../middleware/auth');
const expenseModel = require('../models/expenseModel');
const expenseService = require('../services/expenseService');
const { toCsv } = require('../utils/csvExport');
const { todayISO, getMonthRange } = require('../utils/dateUtils');
const { query } = require('../db/database');

router.get('/dashboard-stats', auth, async (req, res, next) => {
  try {
    res.json(await expenseService.getDashboardStats(req.user.userId));
  } catch (err) { next(err); }
});

router.get('/monthly-by-category', auth, async (req, res, next) => {
  try {
    const { year, month } = req.query;
    const now = new Date();
    res.json({ data: await expenseService.getMonthlyByCategory(
      req.user.userId,
      Number(year) || now.getFullYear(),
      Number(month) || now.getMonth() + 1
    )});
  } catch (err) { next(err); }
});

router.get('/spending-trend', auth, async (req, res, next) => {
  try {
    const now = new Date();
    const { start } = getMonthRange(now.getFullYear(), now.getMonth() + 1);
    const { startDate = start, endDate = todayISO() } = req.query;
    res.json({ data: await expenseService.getSpendingTrend(req.user.userId, startDate, endDate) });
  } catch (err) { next(err); }
});

router.get('/category-breakdown', auth, async (req, res, next) => {
  try {
    const now = new Date();
    const { start } = getMonthRange(now.getFullYear(), now.getMonth() + 1);
    const { startDate = start, endDate = todayISO() } = req.query;
    res.json({ data: await expenseService.getCategoryBreakdown(req.user.userId, startDate, endDate) });
  } catch (err) { next(err); }
});

router.get('/top-days', auth, async (req, res, next) => {
  try {
    const now = new Date();
    const { start } = getMonthRange(now.getFullYear(), now.getMonth() + 1);
    const { startDate = start, endDate = todayISO(), limit = 10 } = req.query;
    res.json({ data: await expenseService.getTopDays(req.user.userId, startDate, endDate, limit) });
  } catch (err) { next(err); }
});

router.get('/export-csv', auth, async (req, res, next) => {
  try {
    const now = new Date();
    const { start } = getMonthRange(now.getFullYear(), now.getMonth() + 1);
    const { startDate = start, endDate = todayISO(), ...rest } = req.query;
    const expenses = await expenseModel.findAll(req.user.userId, { startDate, endDate, ...rest });
    const csv = toCsv(expenses);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="expenses-${startDate}-${endDate}.csv"`);
    res.send(csv);
  } catch (err) { next(err); }
});

router.get('/income-vs-expenses', auth, async (req, res, next) => {
  try {
    const now = new Date();
    const defaultStart = `${now.getFullYear() - 1}-${String(now.getMonth() + 2).padStart(2, '0')}-01`;
    const { startDate = defaultStart, endDate = todayISO() } = req.query;
    const userId = req.user.userId;

    const expenseRows = await query(
      `SELECT to_char(date, 'YYYY-MM') AS month, SUM(amount * exchange_rate)::float AS total
       FROM expenses
       WHERE user_id = $1 AND date >= $2 AND date <= $3
       GROUP BY month ORDER BY month ASC`,
      [userId, startDate, endDate]
    );

    const incomeRows = await query(
      `SELECT to_char(date, 'YYYY-MM') AS month, SUM(amount * exchange_rate)::float AS total
       FROM incomes
       WHERE user_id = $1 AND date >= $2 AND date <= $3
       GROUP BY month ORDER BY month ASC`,
      [userId, startDate, endDate]
    );

    // Build a unified month list
    const months = [...new Set([
      ...expenseRows.map(r => r.month),
      ...incomeRows.map(r => r.month),
    ])].sort();

    const expMap = Object.fromEntries(expenseRows.map(r => [r.month, r.total]));
    const incMap = Object.fromEntries(incomeRows.map(r => [r.month, r.total]));

    const data = months.map(month => ({
      month,
      income:   incMap[month]  ?? 0,
      expenses: expMap[month]  ?? 0,
      net:      (incMap[month] ?? 0) - (expMap[month] ?? 0),
    }));

    res.json({ data });
  } catch (err) { next(err); }
});

router.get('/net-worth-trend', auth, async (req, res, next) => {
  try {
    const userId = req.user.userId;

    // Get all balance snapshots with account type and exchange_rate
    const rows = await query(
      `SELECT ab.recorded_date::text AS date,
              a.type,
              ab.balance,
              ab.exchange_rate
       FROM account_balances ab
       JOIN accounts a ON ab.account_id = a.id
       WHERE a.user_id = $1
       ORDER BY ab.recorded_date ASC`,
      [userId]
    );

    if (!rows.length) return res.json({ data: [] });

    // Group by date, computing net worth per day
    const byDate = {};
    for (const r of rows) {
      const d = r.date.split('T')[0];
      if (!byDate[d]) byDate[d] = { assets: 0, liabilities: 0 };
      const converted = r.exchange_rate && r.exchange_rate !== 1
        ? r.balance / r.exchange_rate
        : r.balance ?? 0;
      if (r.type === 'liability') byDate[d].liabilities += converted;
      else byDate[d].assets += converted;
    }

    const data = Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, { assets, liabilities }]) => ({
        date,
        net_worth: Math.round((assets - liabilities) * 100) / 100,
        assets:    Math.round(assets * 100) / 100,
        liabilities: Math.round(liabilities * 100) / 100,
      }));

    res.json({ data });
  } catch (err) { next(err); }
});

router.get('/upcoming-recurring', auth, async (req, res, next) => {
  try {
    const { days = 7 } = req.query;
    const userId = req.user.userId;

    const rows = await query(
      `SELECT r.id, r.description, r.amount, r.currency, r.exchange_rate,
              r.interval_type, r.next_due_date::text AS next_due_date,
              c.name AS category, c.icon AS category_icon
       FROM recurring_expenses r
       LEFT JOIN categories c ON r.category_id = c.id
       WHERE r.user_id = $1
         AND r.next_due_date <= CURRENT_DATE + ($2::int * INTERVAL '1 day')
       ORDER BY r.next_due_date ASC
       LIMIT 10`,
      [userId, Number(days)]
    );

    res.json({ data: rows });
  } catch (err) { next(err); }
});

module.exports = router;
