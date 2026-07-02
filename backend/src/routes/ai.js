const crypto = require('crypto');
const router = require('express').Router();
const auth = require('../middleware/auth');
const userModel = require('../models/userModel');
const categoryModel = require('../models/categoryModel');
const { parseExpenses, answerQuestion } = require('../services/aiService');
const { query, execute } = require('../db/database');
const { getFinanceContext } = require('../services/expenseService');

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

    const context = await getFinanceContext(userId);
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
