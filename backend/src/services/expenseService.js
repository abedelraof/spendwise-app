const { query, queryOne, execute } = require('../db/database');
const { getMonthRange, currentYearMonth } = require('../utils/dateUtils');
const expenseModel = require('../models/expenseModel');
const { matchOrCreateCategory } = require('./categoryService');

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

async function invalidateInsightCache(userId, dates = []) {
  const months = new Set([currentYearMonth()]);
  for (const d of dates) { if (d) months.add(d.slice(0, 7)); }
  for (const ym of months) {
    await execute('DELETE FROM monthly_insights WHERE user_id = $1 AND year_month = $2', [userId, ym]);
  }
}

async function getFinanceContext(userId) {
  const now = new Date();
  const { start: monthStart } = getMonthRange(now.getFullYear(), now.getMonth() + 1);

  const [expenses, categories, incomes, budgets, goals, accounts, stats] = await Promise.all([
    query(
      `SELECT e.date, e.amount, e.currency, e.exchange_rate, e.description,
              c.name AS category, s.name AS subcategory
       FROM expenses e
       LEFT JOIN categories c ON e.category_id = c.id
       LEFT JOIN subcategories s ON e.subcategory_id = s.id
       WHERE e.user_id = $1 ORDER BY e.date DESC LIMIT 50`,
      [userId]
    ),
    query(
      `SELECT c.name AS category, SUM(e.amount * e.exchange_rate)::float AS total
       FROM expenses e
       LEFT JOIN categories c ON e.category_id = c.id
       WHERE e.user_id = $1 AND e.date >= $2
       GROUP BY c.name ORDER BY total DESC`,
      [userId, monthStart]
    ),
    query(
      `SELECT date, amount, currency, exchange_rate, source, description
       FROM incomes WHERE user_id = $1 ORDER BY date DESC LIMIT 20`,
      [userId]
    ),
    query(
      `SELECT c.name AS category, b.amount::float AS budget_limit,
              COALESCE(SUM(e.amount * e.exchange_rate), 0)::float AS spent
       FROM budgets b
       LEFT JOIN categories c ON b.category_id = c.id
       LEFT JOIN expenses e ON e.category_id = b.category_id
         AND e.user_id = b.user_id
         AND e.date >= $2
       WHERE b.user_id = $1
       GROUP BY b.id, c.name, b.amount`,
      [userId, monthStart]
    ),
    query(
      `SELECT name, target_amount::float, target_currency, current_amount::float, target_date
       FROM savings_goals WHERE user_id = $1`,
      [userId]
    ),
    query(
      `SELECT a.name, a.type, a.currency,
              (SELECT ab.balance FROM account_balances ab
               WHERE ab.account_id = a.id
               ORDER BY ab.recorded_date DESC LIMIT 1)::float AS latest_balance
       FROM accounts a WHERE a.user_id = $1`,
      [userId]
    ),
    getDashboardStats(userId),
  ]);

  return { expenses, categories, incomes, budgets, goals, accounts, stats };
}

async function createExpenses(userId, expenses) {
  const resolved = await Promise.all(expenses.map(async e => {
    const { category_id, subcategory_id } = await matchOrCreateCategory(
      userId, e.category, e.subcategory
    );
    return { ...e, category_id, subcategory_id };
  }));

  const ids = await expenseModel.insertMany(userId, resolved);
  const created = await Promise.all(ids.map(id => expenseModel.findById(id, userId)));

  await invalidateInsightCache(userId, resolved.map(e => e.date));
  return created;
}

module.exports = {
  getDashboardStats, getMonthlyByCategory, getSpendingTrend, getCategoryBreakdown, getMoMComparison, getTopDays,
  createExpenses, invalidateInsightCache, getFinanceContext,
};
