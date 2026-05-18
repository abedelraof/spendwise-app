const db = require('../db/database');
const { getMonthRange } = require('../utils/dateUtils');

function getDashboardStats(userId) {
  const now = new Date();
  const { start, end } = getMonthRange(now.getFullYear(), now.getMonth() + 1);

  const total = db.prepare(`
    SELECT COALESCE(SUM(amount * exchange_rate), 0) AS total
    FROM expenses WHERE user_id = ? AND date BETWEEN ? AND ?
  `).get(userId, start, end);

  const topCat = db.prepare(`
    SELECT c.name, SUM(e.amount * e.exchange_rate) AS total
    FROM expenses e LEFT JOIN categories c ON e.category_id = c.id
    WHERE e.user_id = ? AND e.date BETWEEN ? AND ?
    GROUP BY e.category_id ORDER BY total DESC LIMIT 1
  `).get(userId, start, end);

  const count = db.prepare(`
    SELECT COUNT(*) AS cnt FROM expenses WHERE user_id = ? AND date BETWEEN ? AND ?
  `).get(userId, start, end);

  const days = Math.max(1, new Date().getDate());

  const incomeTotal = db.prepare(
    `SELECT COALESCE(SUM(amount * exchange_rate), 0) AS total
     FROM incomes WHERE user_id = ? AND date BETWEEN ? AND ?`
  ).get(userId, start, end);

  return {
    totalThisMonth: total.total,
    topCategory: topCat?.name || null,
    dailyAverage: total.total / days,
    transactionCount: count.cnt,
    month: start.slice(0, 7),
    incomeThisMonth: incomeTotal.total,
  };
}

function getMonthlyByCategory(userId, year, month) {
  const { start, end } = getMonthRange(year, month);
  return db.prepare(`
    SELECT c.name AS category, c.color,
      SUM(e.amount * e.exchange_rate) AS total
    FROM expenses e LEFT JOIN categories c ON e.category_id = c.id
    WHERE e.user_id = ? AND e.date BETWEEN ? AND ?
    GROUP BY e.category_id ORDER BY total DESC
  `).all(userId, start, end);
}

function getSpendingTrend(userId, startDate, endDate) {
  return db.prepare(`
    SELECT date, SUM(amount * exchange_rate) AS total
    FROM expenses WHERE user_id = ? AND date BETWEEN ? AND ?
    GROUP BY date ORDER BY date
  `).all(userId, startDate, endDate);
}

function getCategoryBreakdown(userId, startDate, endDate) {
  const rows = db.prepare(`
    SELECT c.name AS category, c.color,
      SUM(e.amount * e.exchange_rate) AS total
    FROM expenses e LEFT JOIN categories c ON e.category_id = c.id
    WHERE e.user_id = ? AND e.date BETWEEN ? AND ?
    GROUP BY e.category_id ORDER BY total DESC
  `).all(userId, startDate, endDate);

  const grandTotal = rows.reduce((s, r) => s + r.total, 0);
  return rows.map(r => ({ ...r, percentage: grandTotal ? Math.round((r.total / grandTotal) * 100) : 0 }));
}

function getMoMComparison(userId) {
  const now = new Date();
  const curYear = now.getFullYear(), curMonth = now.getMonth() + 1;
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1);
  const prevYear = prevDate.getFullYear(), prevMonth = prevDate.getMonth() + 1;

  const { start: cs, end: ce } = getMonthRange(curYear, curMonth);
  const { start: ps, end: pe } = getMonthRange(prevYear, prevMonth);

  const query = (s, e) => db.prepare(`
    SELECT COALESCE(SUM(amount * exchange_rate), 0) AS total FROM expenses WHERE user_id = ? AND date BETWEEN ? AND ?
  `).get(userId, s, e).total;

  const current = query(cs, ce);
  const previous = query(ps, pe);
  const delta = current - previous;
  const deltaPercent = previous ? Math.round((delta / previous) * 100) : null;

  return {
    current: { month: cs.slice(0, 7), total: current },
    previous: { month: ps.slice(0, 7), total: previous },
    delta, deltaPercent,
  };
}

function getTopDays(userId, startDate, endDate, limit = 10) {
  return db.prepare(`
    SELECT date, SUM(amount * exchange_rate) AS total
    FROM expenses WHERE user_id = ? AND date BETWEEN ? AND ?
    GROUP BY date ORDER BY total DESC LIMIT ?
  `).all(userId, startDate, endDate, Number(limit));
}

module.exports = { getDashboardStats, getMonthlyByCategory, getSpendingTrend, getCategoryBreakdown, getMoMComparison, getTopDays };
