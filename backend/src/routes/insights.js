const router = require('express').Router();
const auth = require('../middleware/auth');
const { execute } = require('../db/database');
const { generateMonthlyInsight } = require('../services/insightService');
const { currentYearMonth } = require('../utils/dateUtils');

router.get('/monthly', auth, async (req, res, next) => {
  try {
    const yearMonth = req.query.yearMonth || currentYearMonth();
    const force = req.query.force === 'true';

    const { insight, cached } = await generateMonthlyInsight(req.user.userId, yearMonth, { force });
    res.json({ insight, yearMonth, cached });
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
