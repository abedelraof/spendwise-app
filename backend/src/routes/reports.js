const router = require('express').Router();
const auth = require('../middleware/auth');
const expenseModel = require('../models/expenseModel');
const expenseService = require('../services/expenseService');
const { toCsv } = require('../utils/csvExport');
const { todayISO, getMonthRange } = require('../utils/dateUtils');

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

module.exports = router;
