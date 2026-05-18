const router = require('express').Router();
const auth = require('../middleware/auth');
const expenseModel = require('../models/expenseModel');
const expenseService = require('../services/expenseService');
const { toCsv } = require('../utils/csvExport');
const { todayISO, getMonthRange } = require('../utils/dateUtils');

router.get('/dashboard-stats', auth, (req, res) => {
  res.json(expenseService.getDashboardStats(req.user.userId));
});

router.get('/monthly-by-category', auth, (req, res) => {
  const { year, month } = req.query;
  const now = new Date();
  res.json({ data: expenseService.getMonthlyByCategory(
    req.user.userId,
    Number(year) || now.getFullYear(),
    Number(month) || now.getMonth() + 1
  )});
});

router.get('/spending-trend', auth, (req, res) => {
  const now = new Date();
  const { start } = getMonthRange(now.getFullYear(), now.getMonth() + 1);
  const { startDate = start, endDate = todayISO() } = req.query;
  res.json({ data: expenseService.getSpendingTrend(req.user.userId, startDate, endDate) });
});

router.get('/category-breakdown', auth, (req, res) => {
  const now = new Date();
  const { start } = getMonthRange(now.getFullYear(), now.getMonth() + 1);
  const { startDate = start, endDate = todayISO() } = req.query;
  res.json({ data: expenseService.getCategoryBreakdown(req.user.userId, startDate, endDate) });
});

router.get('/top-days', auth, (req, res) => {
  const now = new Date();
  const { start } = getMonthRange(now.getFullYear(), now.getMonth() + 1);
  const { startDate = start, endDate = todayISO(), limit = 10 } = req.query;
  res.json({ data: expenseService.getTopDays(req.user.userId, startDate, endDate, limit) });
});

router.get('/export-csv', auth, (req, res) => {
  const now = new Date();
  const { start } = getMonthRange(now.getFullYear(), now.getMonth() + 1);
  const { startDate = start, endDate = todayISO(), ...rest } = req.query;
  const expenses = expenseModel.findAll(req.user.userId, { startDate, endDate, ...rest });
  const csv = toCsv(expenses);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="expenses-${startDate}-${endDate}.csv"`);
  res.send(csv);
});

module.exports = router;
