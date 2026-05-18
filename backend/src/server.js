require('dotenv').config();
const cron = require('node-cron');
const app = require('./app');
const runMigrations = require('./db/migrations');
const { processOverdue } = require('./services/recurringService');

const PORT = process.env.PORT || 3001;

runMigrations();
processOverdue(); // catch any backlog on startup

// Apply overdue recurring expenses every day at midnight
cron.schedule('0 0 * * *', () => {
  const count = processOverdue();
  if (count) console.log(`[cron] Applied ${count} recurring expense(s)`);
});

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
