require('dotenv').config();
const cron = require('node-cron');
const app = require('./app');
const runMigrations = require('./db/migrations');
const { processOverdue } = require('./services/recurringService');

const { execute } = require('./db/database');

const PORT = process.env.PORT || 3001;

(async () => {
  await runMigrations();
  await processOverdue(); // catch any backlog on startup

  // Apply overdue recurring expenses every day at midnight
  cron.schedule('0 0 * * *', async () => {
    try {
      const count = await processOverdue();
      if (count) console.log(`[cron] Applied ${count} recurring expense(s)`);
    } catch (err) {
      console.error('[cron] processOverdue failed', err);
    }
  });

  // Reset AI usage counters on the 1st of each month
  cron.schedule('0 0 1 * *', async () => {
    try {
      await execute(
        `UPDATE users SET ai_used_this_month = 0,
           ai_quota_reset_date = TO_CHAR(DATE_TRUNC('month', NOW() + INTERVAL '1 month'), 'YYYY-MM-DD')
         WHERE plan = 'pro'`
      );
      console.log('[cron] Reset monthly AI usage counters');
    } catch (err) {
      console.error('[cron] AI usage reset failed', err);
    }
  });

  // Downgrade expired pro subscriptions daily at 1 AM
  cron.schedule('0 1 * * *', async () => {
    try {
      await execute(`UPDATE users SET plan = 'free' WHERE plan = 'pro' AND subscription_expiry < NOW()`);
      console.log('[cron] Checked subscription expiries');
    } catch (err) {
      console.error('[cron] Subscription expiry check failed', err);
    }
  });

  app.listen(PORT, () => {
    console.log(`Backend running on http://localhost:${PORT}`);
  });
})();
