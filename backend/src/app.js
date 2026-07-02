require('dotenv').config();
const express = require('express');
const cors = require('cors');
const errorHandler = require('./middleware/errorHandler');
const { getBot } = require('./services/telegramBotService');

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173', credentials: true }));

// Telegram webhook must be mounted before express.json() — Telegraf parses its own request body.
const telegramBot = getBot();
if (telegramBot && process.env.TELEGRAM_MODE !== 'polling' && process.env.TELEGRAM_WEBHOOK_SECRET) {
  app.use(telegramBot.webhookCallback(`/api/telegram/webhook/${process.env.TELEGRAM_WEBHOOK_SECRET}`));
}

app.use(express.json());

app.use('/api/telegram-link', require('./routes/telegramLink'));
app.use('/api/auth',       require('./routes/auth'));
app.use('/api/settings',   require('./routes/settings'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/ai',         require('./routes/ai'));
app.use('/api/expenses',   require('./routes/expenses'));
app.use('/api/reports',    require('./routes/reports'));
app.use('/api/budgets',    require('./routes/budgets'));
app.use('/api/recurring',  require('./routes/recurring'));
app.use('/api/insights',   require('./routes/insights'));
app.use('/api/search',     require('./routes/search'));
app.use('/api/import',     require('./routes/import'));
app.use('/api/accounts',       require('./routes/accounts'));
app.use('/api/account-groups', require('./routes/accountGroups'));
app.use('/api/rates',      require('./routes/rates'));
app.use('/api/goals',      require('./routes/goals'));
app.use('/api/income',     require('./routes/income'));
app.use('/api/seed',       require('./routes/seed'));
app.use('/api/admin',      require('./routes/admin'));
app.use('/api/subscription', require('./routes/subscription'));

app.use(errorHandler);

module.exports = app;
