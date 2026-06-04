const express    = require('express');
const router     = express.Router();
const auth       = require('../middleware/auth');
const adminAuth  = require('../middleware/adminAuth');
const { query, queryOne, execute } = require('../db/database');

// All admin routes require JWT + admin role
router.use(auth, adminAuth);

// ── GET /api/admin/stats ──────────────────────────────────────────────────────
router.get('/stats', async (req, res, next) => {
  try {
    const [
      users,
      newUsers,
      activeUsers,
      expenses,
      income,
      accounts,
      apiKeyUsers,
      signupsByMonth,
    ] = await Promise.all([
      queryOne('SELECT COUNT(*)::int AS total FROM users'),
      queryOne(`SELECT COUNT(*)::int AS total FROM users
                WHERE created_at >= date_trunc('month', NOW())`),
      queryOne(`SELECT COUNT(DISTINCT user_id)::int AS total FROM expenses
                WHERE date >= (NOW() - INTERVAL '30 days')::date::text`),
      queryOne('SELECT COUNT(*)::int AS count, COALESCE(SUM(amount),0)::numeric AS total FROM expenses'),
      queryOne('SELECT COUNT(*)::int AS count, COALESCE(SUM(amount),0)::numeric AS total FROM incomes'),
      queryOne('SELECT COUNT(*)::int AS total FROM accounts'),
      queryOne('SELECT COUNT(*)::int AS total FROM users WHERE claude_api_key IS NOT NULL'),
      query(`SELECT TO_CHAR(date_trunc('month', created_at), 'YYYY-MM') AS month,
                    COUNT(*)::int AS count
             FROM users
             WHERE created_at >= NOW() - INTERVAL '6 months'
             GROUP BY 1 ORDER BY 1`),
    ]);

    res.json({
      total_users:           users.total,
      new_users_this_month:  newUsers.total,
      active_users_30d:      activeUsers.total,
      total_expenses:        expenses.count,
      total_expense_amount:  Number(expenses.total),
      total_income_records:  income.count,
      total_income_amount:   Number(income.total),
      total_accounts:        accounts.total,
      users_with_api_key:    apiKeyUsers.total,
      signups_by_month:      signupsByMonth,
    });
  } catch (err) { next(err); }
});

// ── GET /api/admin/users ──────────────────────────────────────────────────────
router.get('/users', async (req, res, next) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit  || 20), 100);
    const offset = parseInt(req.query.offset || 0);
    const search = req.query.search ? `%${req.query.search.toLowerCase()}%` : null;

    const whereClause = search ? 'WHERE LOWER(u.email) LIKE $3' : '';
    const params      = search ? [limit, offset, search] : [limit, offset];

    const users = await query(`
      SELECT
        u.id,
        u.email,
        u.currency,
        u.theme,
        u.is_admin,
        u.created_at,
        (u.claude_api_key IS NOT NULL)            AS has_api_key,
        COUNT(DISTINCT e.id)::int                 AS expense_count,
        COALESCE(SUM(e.amount), 0)::numeric       AS total_spent,
        COUNT(DISTINCT i.id)::int                 AS income_count,
        COALESCE(SUM(i.amount), 0)::numeric       AS total_income,
        COUNT(DISTINCT a.id)::int                 AS account_count,
        COUNT(DISTINCT g.id)::int                 AS goal_count,
        MAX(e.date)                               AS last_activity
      FROM users u
      LEFT JOIN expenses  e ON e.user_id = u.id
      LEFT JOIN incomes   i ON i.user_id = u.id
      LEFT JOIN accounts  a ON a.user_id = u.id
      LEFT JOIN savings_goals g ON g.user_id = u.id
      ${whereClause}
      GROUP BY u.id
      ORDER BY u.created_at DESC
      LIMIT $1 OFFSET $2
    `, params);

    const totalRow = await queryOne(
      search
        ? 'SELECT COUNT(*)::int AS total FROM users WHERE LOWER(email) LIKE $1'
        : 'SELECT COUNT(*)::int AS total FROM users',
      search ? [search] : []
    );

    res.json({ users, total: totalRow.total, limit, offset });
  } catch (err) { next(err); }
});

// ── GET /api/admin/users/:id ──────────────────────────────────────────────────
router.get('/users/:id', async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id);

    const [user, expenseStats, incomeStats, accountStats, goalStats, recentExpenses] = await Promise.all([
      queryOne(`SELECT id, email, currency, accounts_currency, theme, is_admin,
                       (claude_api_key IS NOT NULL) AS has_api_key, created_at
                FROM users WHERE id = $1`, [userId]),
      queryOne(`SELECT COUNT(*)::int AS count, COALESCE(SUM(amount),0)::numeric AS total
                FROM expenses WHERE user_id = $1`, [userId]),
      queryOne(`SELECT COUNT(*)::int AS count, COALESCE(SUM(amount),0)::numeric AS total
                FROM incomes WHERE user_id = $1`, [userId]),
      queryOne(`SELECT COUNT(*)::int AS count FROM accounts WHERE user_id = $1`, [userId]),
      queryOne(`SELECT COUNT(*)::int AS count FROM savings_goals WHERE user_id = $1`, [userId]),
      query(`SELECT e.amount, e.currency, e.date, e.description, c.name AS category
             FROM expenses e
             LEFT JOIN categories c ON c.id = e.category_id
             WHERE e.user_id = $1
             ORDER BY e.date DESC LIMIT 5`, [userId]),
    ]);

    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({
      ...user,
      stats: {
        expense_count:  expenseStats.count,
        total_spent:    Number(expenseStats.total),
        income_count:   incomeStats.count,
        total_income:   Number(incomeStats.total),
        account_count:  accountStats.count,
        goal_count:     goalStats.count,
      },
      recent_expenses: recentExpenses,
    });
  } catch (err) { next(err); }
});

// ── DELETE /api/admin/users/:id ───────────────────────────────────────────────
router.delete('/users/:id', async (req, res, next) => {
  try {
    const targetId = parseInt(req.params.id);
    if (targetId === req.user.userId) {
      return res.status(400).json({ error: "You can't delete your own account" });
    }
    await execute('DELETE FROM users WHERE id = $1', [targetId]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
