const db = require('../db/database');
const { getMonthRange } = require('../utils/dateUtils');

function getBudgetsWithSpending(userId) {
  const now = new Date();
  const { start, end } = getMonthRange(now.getFullYear(), now.getMonth() + 1);

  const budgets = db.prepare(`
    SELECT b.*, c.name AS category_name, c.icon, c.color
    FROM budgets b
    JOIN categories c ON b.category_id = c.id
    WHERE b.user_id = ?
  `).all(userId);

  return budgets.map(b => {
    const spent = db.prepare(`
      SELECT COALESCE(SUM(amount * exchange_rate), 0) AS total
      FROM expenses WHERE user_id = ? AND category_id = ? AND date BETWEEN ? AND ?
    `).get(userId, b.category_id, start, end).total;
    const percentage = b.amount ? Math.round((spent / b.amount) * 100) : 0;
    return { ...b, spent, percentage };
  });
}

const createBudget = (userId, { categoryId, amount, period = 'monthly' }) =>
  db.prepare('INSERT OR REPLACE INTO budgets (user_id, category_id, amount, period) VALUES (?, ?, ?, ?)').run(userId, categoryId, amount, period);

const updateBudget = (id, userId, amount) =>
  db.prepare('UPDATE budgets SET amount = ? WHERE id = ? AND user_id = ?').run(amount, id, userId);

const removeBudget = (id, userId) =>
  db.prepare('DELETE FROM budgets WHERE id = ? AND user_id = ?').run(id, userId);

module.exports = { getBudgetsWithSpending, createBudget, updateBudget, removeBudget };
