const { query, queryOne } = require('../db/database');
const { getMonthRange } = require('../utils/dateUtils');

async function getBudgetsWithSpending(userId) {
  const now = new Date();
  const { start, end } = getMonthRange(now.getFullYear(), now.getMonth() + 1);

  const budgets = await query(
    `SELECT b.*, c.name AS category_name, c.icon, c.color
     FROM budgets b
     JOIN categories c ON b.category_id = c.id
     WHERE b.user_id = $1`,
    [userId]
  );

  return Promise.all(budgets.map(async (b) => {
    const row = await queryOne(
      `SELECT COALESCE(SUM(amount * exchange_rate), 0)::float AS total
       FROM expenses WHERE user_id = $1 AND category_id = $2 AND date BETWEEN $3 AND $4`,
      [userId, b.category_id, start, end]
    );
    const spent = parseFloat(row.total);
    const percentage = b.amount ? Math.round((spent / b.amount) * 100) : 0;
    return { ...b, spent, percentage };
  }));
}

const createBudget = (userId, { categoryId, amount, period = 'monthly' }) =>
  require('../db/database').execute(
    `INSERT INTO budgets (user_id, category_id, amount, period) VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, category_id, period) DO UPDATE SET amount = EXCLUDED.amount`,
    [userId, categoryId, amount, period]
  );

const updateBudget = (id, userId, amount) =>
  require('../db/database').execute(
    'UPDATE budgets SET amount = $1 WHERE id = $2 AND user_id = $3',
    [amount, id, userId]
  );

const removeBudget = (id, userId) =>
  require('../db/database').execute(
    'DELETE FROM budgets WHERE id = $1 AND user_id = $2',
    [id, userId]
  );

module.exports = { getBudgetsWithSpending, createBudget, updateBudget, removeBudget };
