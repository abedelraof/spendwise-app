require('dotenv').config();
const express = require('express');
const cors = require('cors');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(express.json());

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
app.use('/api/accounts',   require('./routes/accounts'));
app.use('/api/rates',      require('./routes/rates'));
app.use('/api/goals',      require('./routes/goals'));
app.use('/api/income',     require('./routes/income'));

app.use(errorHandler);

module.exports = app;
