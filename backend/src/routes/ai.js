const crypto = require('crypto');
const router = require('express').Router();
const auth = require('../middleware/auth');
const userModel = require('../models/userModel');
const categoryModel = require('../models/categoryModel');
const { parseExpenses, answerQuestion } = require('../services/aiService');
const { query, execute } = require('../db/database');
const { getDashboardStats } = require('../services/expenseService');
const { getMonthRange } = require('../utils/dateUtils');

function getResetDate() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 10);
}

function getCacheKey(userId, text) {
  return crypto.createHash('sha256').update(`${userId}:${text}`).digest('hex');
}

async function enforceAiQuota(req, res, next) {
  const user = await userModel.findById(req.user.userId);
  if (!user) return res.status(401).json({ error: 'User not found' });
  if (user.plan === 'free') {
    return res.status(403).json({ error: 'pro_required', message: 'AI features require a Pro subscription.' });
  }
  if (user.ai_used_this_month >= 100) {
    return res.status(429).json({ error: 'quota_exceeded', message: 'Monthly AI quota reached.', reset_date: getResetDate() });
  }
  req.aiUser = user;
  next();
}

async function getCachedResponse(cacheKey) {
  const rows = await query(
    `SELECT response_json FROM ai_parse_cache
     WHERE cache_key = $1 AND created_at > NOW() - INTERVAL '1 day'`,
    [cacheKey]
  );
  return rows.length ? JSON.parse(rows[0].response_json) : null;
}

async function setCachedResponse(cacheKey, data) {
  await execute(
    `INSERT INTO ai_parse_cache (cache_key, response_json)
     VALUES ($1, $2)
     ON CONFLICT (cache_key) DO UPDATE SET response_json = EXCLUDED.response_json, created_at = NOW()`,
    [cacheKey, JSON.stringify(data)]
  );
}

async function incrementAiUsage(userId) {
  await execute(
    `UPDATE users SET ai_used_this_month = ai_used_this_month + 1 WHERE id = $1`,
    [userId]
  );
}

router.post('/parse', auth, enforceAiQuota, async (req, res, next) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: 'Text is required' });

    const userId = req.user.userId;
    const cacheKey = getCacheKey(userId, text.trim());
    const cached = await getCachedResponse(cacheKey);
    if (cached) return res.json({ ...cached, cached: true });

    const categories = await categoryModel.findByUser(userId);
    const expenses = await parseExpenses(text, null, req.aiUser.currency, categories);
    const result = { expenses };

    await setCachedResponse(cacheKey, result);
    await incrementAiUsage(userId);

    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/ask', auth, enforceAiQuota, async (req, res, next) => {
  try {
    const { question } = req.body;
    if (!question?.trim()) return res.status(400).json({ error: 'Question is required' });

    const userId = req.user.userId;
    const cacheKey = getCacheKey(userId, question.trim());
    const cached = await getCachedResponse(cacheKey);
    if (cached) return res.json({ ...cached, cached: true });

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
    const answer = await answerQuestion(question.trim(), context, null, req.aiUser.currency);
    const result = { answer };

    await setCachedResponse(cacheKey, result);
    await incrementAiUsage(userId);

    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
