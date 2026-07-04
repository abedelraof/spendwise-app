const { queryOne, execute } = require('../db/database');
const userModel = require('../models/userModel');
const { generateInsight } = require('./aiService');
const { getMonthlyByCategory, getMoMComparison } = require('./expenseService');
const { getMonthRange } = require('../utils/dateUtils');

async function generateMonthlyInsight(userId, yearMonth, { force = false } = {}) {
  const [year, month] = yearMonth.split('-').map(Number);
  const { start, end } = getMonthRange(year, month);

  const countRow = await queryOne(
    'SELECT COUNT(*)::int AS cnt FROM expenses WHERE user_id = $1 AND date BETWEEN $2 AND $3',
    [userId, start, end]
  );
  if (countRow.cnt === 0) return { insight: null, cached: false };

  if (!force) {
    const cached = await queryOne(
      'SELECT insight FROM monthly_insights WHERE user_id = $1 AND year_month = $2',
      [userId, yearMonth]
    );
    if (cached) return { insight: cached.insight, cached: true };
  }

  const user = await userModel.findById(userId);
  if (!user) return { insight: null, cached: false };

  const categoryData = await getMonthlyByCategory(userId, year, month);
  const mom = await getMoMComparison(userId);
  const insight = await generateInsight(
    { yearMonth, categoryBreakdown: categoryData, momComparison: mom },
    null,
    user.currency
  );

  await execute(
    `INSERT INTO monthly_insights (user_id, year_month, insight) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, year_month) DO UPDATE SET insight = EXCLUDED.insight`,
    [userId, yearMonth, insight]
  );

  return { insight, cached: false };
}

module.exports = { generateMonthlyInsight };
