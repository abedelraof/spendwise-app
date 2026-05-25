const router = require('express').Router();
const auth = require('../middleware/auth');
const userModel = require('../models/userModel');
const categoryModel = require('../models/categoryModel');
const { parseExpenses, answerQuestion } = require('../services/aiService');
const { query } = require('../db/database');
const { getDashboardStats } = require('../services/expenseService');
const { getMonthRange } = require('../utils/dateUtils');

router.post('/parse', auth, async (req, res, next) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: 'Text is required' });

    const user = await userModel.findById(req.user.userId);
    if (!user) return res.status(401).json({ error: 'User not found' });
    if (!user.claude_api_key) {
      return res.status(402).json({ error: 'No Claude API key configured. Please add one in Settings.' });
    }

    const categories = await categoryModel.findByUser(req.user.userId);
    const expenses = await parseExpenses(text, user.claude_api_key, user.currency, categories);
    res.json({ expenses });
  } catch (err) {
    if (err.status === 401 || err.message?.includes('authentication')) {
      return res.status(502).json({ error: 'Invalid Claude API key. Please check your key in Settings.' });
    }
    next(err);
  }
});

router.post('/ask', auth, async (req, res, next) => {
  try {
    const { question } = req.body;
    if (!question?.trim()) return res.status(400).json({ error: 'Question is required' });

    const user = await userModel.findById(req.user.userId);
    if (!user) return res.status(401).json({ error: 'User not found' });
    if (!user.claude_api_key) {
      return res.status(402).json({ error: 'No Claude API key configured. Please add one in Settings.' });
    }

    const userId = req.user.userId;
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

    const context = { expenses, categories, incomes, budgets, goals, accounts, stats };
    const answer = await answerQuestion(question.trim(), context, user.claude_api_key, user.currency);
    res.json({ answer });
  } catch (err) {
    if (err.status === 401 || err.message?.includes('authentication')) {
      return res.status(502).json({ error: 'Invalid Claude API key. Please check your key in Settings.' });
    }
    next(err);
  }
});

module.exports = router;
