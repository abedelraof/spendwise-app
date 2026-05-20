const { query, queryOne } = require('../db/database');
const { getMonthRange } = require('../utils/dateUtils');

async function getDashboardStats(userId) {
  const now = new Date();
  const { start, end } = getMonthRange(now.getFullYear(), now.getMonth() + 1);
  const days = Math.max(1, new Date().getDate());

  const [total, topCat, count, incomeTotal] = await Promise.all([
    queryOne(
      `SELECT COALESCE(SUM(amount * exchange_rate), 0)::float AS total
       FROM expenses WHERE user_id = $1 AND date BETWEEN $2 AND $3`,
      [userId, start, end]
    ),
    queryOne(
      `SELECT c.name, SUM(e.amount * e.exchange_rate)::float AS total
       FROM expenses e LEFT JOIN categories c ON e.category_id = c.id
       WHERE e.user_id = $1 AND e.date BETWEEN $2 AND $3
       GROUP BY e.category_id, c.name ORDER BY total DESC LIMIT 1`,
      [userId, start, end]
    ),
    queryOne(
      `SELECT COUNT(*)::int AS cnt FROM expenses WHERE user_id = $1 AND date BETWEEN $2 AND $3`,
      [userId, start, end]
    ),
    queryOne(
      `SELECT COALESCE(SUM(amount * exchange_rate), 0)::float AS total
       FROM incomes WHERE user_id = $1 AND date BETWEEN $2 AND $3`,
      [userId, start, end]
    ),
  ]);

  return {
    totalThisMonth:   parseFloat(total.total),
    topCategory:      topCat?.name || null,
    dailyAverage:     parseFloat(total.total) / days,
    transactionCount: count.cnt,
    month:            start.slice(0, 7),
    incomeThisMonth:  parseFloat(incomeTotal.total),
  };
}

async function getMonthlyByCategory(userId, year, month) {
  const { start, end } = getMonthRange(year, month);
  return query(
    `SELECT c.name AS category, c.color,
       SUM(e.amount * e.exchange_rate)::float AS total
     FROM expenses e LEFT JOIN categories c ON e.category_id = c.id
     WHERE e.user_id = $1 AND e.date BETWEEN $2 AND $3
     GROUP BY e.category_id, c.name, c.color ORDER BY total DESC`,
    [userId, start, end]
  );
}

async function getSpendingTrend(userId, startDate, endDate) {
  return query(
    `SELECT date, SUM(amount * exchange_rate)::float AS total
     FROM expenses WHERE user_id = $1 AND date BETWEEN $2 AND $3
     GROUP BY date ORDER BY date`,
    [userId, startDate, endDate]
  );
}

async function getCategoryBreakdown(userId, startDate, endDate) {
  const rows = await query(
    `SELECT c.name AS category, c.color,
       SUM(e.amount * e.exchange_rate)::float AS total
     FROM expenses e LEFT JOIN categories c ON e.category_id = c.id
     WHERE e.user_id = $1 AND e.date BETWEEN $2 AND $3
     GROUP BY e.category_id, c.name, c.color ORDER BY total DESC`,
    [userId, startDate, endDate]
  );
  const grandTotal = rows.reduce((s, r) => s + r.total, 0);
  return rows.map(r => ({ ...r, percentage: grandTotal ? Math.round((r.total / grandTotal) * 100) : 0 }));
}

async function getMoMComparison(userId) {
  const now = new Date();
  const curYear = now.getFullYear(), curMonth = now.getMonth() + 1;
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1);
  const prevYear = prevDate.getFullYear(), prevMonth = prevDate.getMonth() + 1;

  const { start: cs, end: ce } = getMonthRange(curYear, curMonth);
  const { start: ps, end: pe } = getMonthRange(prevYear, prevMonth);

  const qry = (s, e) => queryOne(
    `SELECT COALESCE(SUM(amount * exchange_rate), 0)::float AS total
     FROM expenses WHERE user_id = $1 AND date BETWEEN $2 AND $3`,
    [userId, s, e]
  ).then(r => parseFloat(r.total));

  const [current, previous] = await Promise.all([qry(cs, ce), qry(ps, pe)]);
  const delta = current - previous;
  const deltaPercent = previous ? Math.round((delta / previous) * 100) : null;

  return {
    current:  { month: cs.slice(0, 7), total: current },
    previous: { month: ps.slice(0, 7), total: previous },
    delta, deltaPercent,
  };
}

async function getTopDays(userId, startDate, endDate, limit = 10) {
  return query(
    `SELECT date, SUM(amount * exchange_rate)::float AS total
     FROM expenses WHERE user_id = $1 AND date BETWEEN $2 AND $3
     GROUP BY date ORDER BY total DESC LIMIT $4`,
    [userId, startDate, endDate, Number(limit)]
  );
}

module.exports = { getDashboardStats, getMonthlyByCategory, getSpendingTrend, getCategoryBreakdown, getMoMComparison, getTopDays };
