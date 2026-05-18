const router = require('express').Router();
const auth = require('../middleware/auth');
const db = require('../db/database');
const userModel = require('../models/userModel');
const { generateInsight } = require('../services/aiService');
const expenseService = require('../services/expenseService');
const { currentYearMonth, getMonthRange } = require('../utils/dateUtils');

router.get('/monthly', auth, async (req, res, next) => {
  try {
    const yearMonth = req.query.yearMonth || currentYearMonth();
    const [year, month] = yearMonth.split('-').map(Number);
    const force = req.query.force === 'true';

    // Check if user actually has expenses this month before using cache
    const { start, end } = getMonthRange(year, month);
    const count = db.prepare(
      'SELECT COUNT(*) AS cnt FROM expenses WHERE user_id = ? AND date BETWEEN ? AND ?'
    ).get(req.user.userId, start, end).cnt;

    // Return cache only if there is real spending data AND not forcing refresh
    if (!force) {
      const cached = db.prepare('SELECT * FROM monthly_insights WHERE user_id = ? AND year_month = ?')
        .get(req.user.userId, yearMonth);
      if (cached && count > 0) {
        return res.json({ insight: cached.insight, yearMonth, cached: true });
      }
    }

    // No data yet — return nothing (frontend handles this gracefully)
    if (count === 0) {
      return res.json({ insight: null, yearMonth, cached: false });
    }

    const user = userModel.findById(req.user.userId);
    if (!user.claude_api_key) {
      return res.status(402).json({ error: 'No Claude API key configured.' });
    }

    const categoryData = expenseService.getMonthlyByCategory(req.user.userId, year, month);
    const mom = expenseService.getMoMComparison(req.user.userId);
    const spendingData = { yearMonth, categoryBreakdown: categoryData, momComparison: mom };

    const insight = await generateInsight(spendingData, user.claude_api_key, user.currency);
    db.prepare('INSERT OR REPLACE INTO monthly_insights (user_id, year_month, insight) VALUES (?, ?, ?)')
      .run(req.user.userId, yearMonth, insight);

    res.json({ insight, yearMonth, cached: false });
  } catch (err) { next(err); }
});

// Invalidate cached insight for current month (called after expense changes)
router.delete('/monthly/cache', auth, (req, res) => {
  const yearMonth = req.query.yearMonth || currentYearMonth();
  db.prepare('DELETE FROM monthly_insights WHERE user_id = ? AND year_month = ?')
    .run(req.user.userId, yearMonth);
  res.json({ success: true });
});

module.exports = router;
