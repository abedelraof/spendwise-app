const router = require('express').Router();
const auth = require('../middleware/auth');
const { queryOne, execute } = require('../db/database');
const userModel = require('../models/userModel');
const { generateInsight } = require('../services/aiService');
const expenseService = require('../services/expenseService');
const { currentYearMonth, getMonthRange } = require('../utils/dateUtils');

router.get('/monthly', auth, async (req, res, next) => {
  try {
    const yearMonth = req.query.yearMonth || currentYearMonth();
    const [year, month] = yearMonth.split('-').map(Number);
    const force = req.query.force === 'true';

    const { start, end } = getMonthRange(year, month);
    const countRow = await queryOne(
      'SELECT COUNT(*)::int AS cnt FROM expenses WHERE user_id = $1 AND date BETWEEN $2 AND $3',
      [req.user.userId, start, end]
    );
    const count = countRow.cnt;

    if (!force) {
      const cached = await queryOne(
        'SELECT * FROM monthly_insights WHERE user_id = $1 AND year_month = $2',
        [req.user.userId, yearMonth]
      );
      if (cached && count > 0) {
        return res.json({ insight: cached.insight, yearMonth, cached: true });
      }
    }

    if (count === 0) return res.json({ insight: null, yearMonth, cached: false });

    const user = await userModel.findById(req.user.userId);
    if (!user) return res.status(401).json({ error: 'User not found' });
    if (!user.claude_api_key)
      return res.status(402).json({ error: 'No Claude API key configured.' });

    const categoryData = await expenseService.getMonthlyByCategory(req.user.userId, year, month);
    const mom = await expenseService.getMoMComparison(req.user.userId);
    const insight = await generateInsight(
      { yearMonth, categoryBreakdown: categoryData, momComparison: mom },
      user.claude_api_key,
      user.currency
    );

    await execute(
      `INSERT INTO monthly_insights (user_id, year_month, insight) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, year_month) DO UPDATE SET insight = EXCLUDED.insight`,
      [req.user.userId, yearMonth, insight]
    );

    res.json({ insight, yearMonth, cached: false });
  } catch (err) { next(err); }
});

router.delete('/monthly/cache', auth, async (req, res, next) => {
  try {
    const yearMonth = req.query.yearMonth || currentYearMonth();
    await execute(
      'DELETE FROM monthly_insights WHERE user_id = $1 AND year_month = $2',
      [req.user.userId, yearMonth]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
