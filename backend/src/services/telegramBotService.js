const { Telegraf, Markup } = require('telegraf');
const { queryOne, execute } = require('../db/database');
const userModel = require('../models/userModel');
const categoryModel = require('../models/categoryModel');
const expenseModel = require('../models/expenseModel');
const goalModel = require('../models/goalModel');
const { parseExpenses, reviseExpenses, answerQuestion } = require('./aiService');
const { createExpenses, getDashboardStats, getFinanceContext, invalidateInsightCache } = require('./expenseService');
const accountService = require('./accountService');
const ratesService = require('./ratesService');

const NOT_LINKED_MSG = 'Your Telegram isn\'t connected to an ExpenseBeam account yet. Open the app → Settings → Connect Telegram to link it.';

const HELP_TEXT = `Here's what I can do:

• Just send a message like "coffee 45, lunch 120" and I'll parse it into expenses for you to confirm.
• /stats — this month's spending summary
• /budgets — budget status for this month
• /recent — your last few expenses
• /goals — savings goal progress
• /networth — assets minus liabilities across all accounts
• /currency <amount> <from> [to] <to> — quick FX conversion, e.g. /currency 100 usd to egp
• /undo — remove the expenses from your last confirmed message
• /ask <question> — ask anything about your finances, e.g. /ask am I on track with my budgets?
• /help — show this message`;

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

let bot = null;

function fmtAmount(n) {
  return Number(n ?? 0).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatExpenseList(expenses, currency) {
  const lines = expenses.map((e, i) => {
    const category = e.subcategory ? `${e.category} / ${e.subcategory}` : e.category;
    return `${i + 1}. ${e.description || e.category} — ${fmtAmount(e.amount)} ${e.currency || currency}\n   📅 ${e.date}   🏷 ${category}`;
  });
  const total = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  return `Here's what I parsed:\n\n${lines.join('\n')}\n\nTotal: ${fmtAmount(total)} ${currency}\n\nConfirm, or send another message to correct anything.`;
}

function formatStats(stats, currency) {
  const cashFlow = stats.incomeThisMonth - stats.totalThisMonth;
  return `📊 This Month (${stats.month})

Spent: ${fmtAmount(stats.totalThisMonth)} ${currency}
Income: ${fmtAmount(stats.incomeThisMonth)} ${currency}
Cash flow: ${cashFlow >= 0 ? '+' : ''}${fmtAmount(cashFlow)} ${currency}
Top category: ${stats.topCategory ?? 'N/A'}
Daily average: ${fmtAmount(stats.dailyAverage)} ${currency}
Transactions: ${stats.transactionCount}`;
}

function formatBudgets(budgets, currency) {
  if (!budgets.length) return 'You don\'t have any budgets set up yet — add some from Planning in the app.';
  const lines = budgets.map(b => {
    const pct = b.budget_limit > 0 ? Math.round((b.spent / b.budget_limit) * 100) : 0;
    const emoji = pct >= 100 ? '🔴' : pct >= 80 ? '🟠' : '🟢';
    return `${emoji} ${b.category}: ${fmtAmount(b.spent)} / ${fmtAmount(b.budget_limit)} ${currency} (${pct}%)`;
  });
  return `💰 Budgets This Month\n\n${lines.join('\n')}`;
}

function formatRecent(expenses, currency) {
  if (!expenses.length) return 'No expenses recorded yet.';
  const lines = expenses.map(e => {
    const category = e.subcategory_name ? `${e.category_name} / ${e.subcategory_name}` : e.category_name;
    return `${e.date} — ${e.description || category} — ${fmtAmount(e.amount)} ${e.currency || currency} (${category})`;
  });
  return `🧾 Recent Expenses\n\n${lines.join('\n')}`;
}

function formatGoals(goals, currency) {
  if (!goals.length) return 'You don\'t have any savings goals yet — add one from Planning in the app.';
  const lines = goals.map(g => {
    const current = g.account_id && g.latest_balance != null ? parseFloat(g.latest_balance) : (g.current_amount ?? 0);
    const pct = g.target_amount > 0 ? Math.min(100, Math.round((current / g.target_amount) * 100)) : 0;
    let dueBadge = '';
    if (g.target_date) {
      const daysLeft = Math.ceil((new Date(g.target_date) - new Date()) / (1000 * 60 * 60 * 24));
      dueBadge = daysLeft < 0 ? ' — Overdue' : ` — ${daysLeft}d left`;
    }
    return `${g.icon || '🎯'} ${g.name}: ${fmtAmount(current)} / ${fmtAmount(g.target_amount)} ${g.target_currency || currency} (${pct}%)${dueBadge}`;
  });
  return `🎯 Savings Goals\n\n${lines.join('\n')}`;
}

function formatNetWorth({ totalAssets, totalLiabilities, netWorth, homeCurrency, unconverted, accountCount }) {
  if (!accountCount) return 'You don\'t have any accounts yet — add some from the Accounts page in the app.';
  const note = unconverted
    ? `\n\n(${unconverted} account${unconverted === 1 ? '' : 's'} excluded — no exchange rate available)`
    : '';
  return `🏦 Net Worth

Assets: ${fmtAmount(totalAssets)} ${homeCurrency}
Liabilities: ${fmtAmount(totalLiabilities)} ${homeCurrency}
Net worth: ${fmtAmount(netWorth)} ${homeCurrency}${note}`;
}

const confirmKeyboard = Markup.inlineKeyboard([
  Markup.button.callback('✅ Confirm', 'confirm_expenses'),
  Markup.button.callback('❌ Cancel', 'cancel_expenses'),
]);

async function getLinkedUser(chatId) {
  const link = await queryOne('SELECT user_id FROM telegram_links WHERE chat_id = $1', [chatId]);
  if (!link) return null;
  return userModel.findById(link.user_id);
}

async function getSession(chatId) {
  return queryOne('SELECT pending_expenses FROM telegram_sessions WHERE chat_id = $1', [chatId]);
}

async function saveSession(chatId, expenses) {
  await execute(
    `INSERT INTO telegram_sessions (chat_id, pending_expenses, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (chat_id) DO UPDATE SET pending_expenses = EXCLUDED.pending_expenses, updated_at = NOW()`,
    [chatId, JSON.stringify(expenses)]
  );
}

async function clearSession(chatId) {
  await execute('DELETE FROM telegram_sessions WHERE chat_id = $1', [chatId]);
}

function createBot() {
  const instance = new Telegraf(BOT_TOKEN);

  instance.start(async (ctx) => {
    const code = (ctx.startPayload || '').trim();
    if (!code) {
      return ctx.reply('Hi! Open ExpenseBeam → Settings → Connect Telegram to get a linking code, then tap the link it gives you.');
    }

    const codeRow = await queryOne(
      'SELECT user_id FROM telegram_link_codes WHERE code = $1 AND expires_at > NOW()',
      [code]
    );
    if (!codeRow) {
      return ctx.reply('That code is invalid or expired. Generate a new one from Settings → Connect Telegram.');
    }

    const chatId = ctx.chat.id;
    await execute('DELETE FROM telegram_links WHERE user_id = $1 OR chat_id = $2', [codeRow.user_id, chatId]);
    await execute('INSERT INTO telegram_links (user_id, chat_id) VALUES ($1, $2)', [codeRow.user_id, chatId]);
    await execute('DELETE FROM telegram_link_codes WHERE user_id = $1', [codeRow.user_id]);

    const user = await userModel.findById(codeRow.user_id);
    await ctx.reply(`✅ Linked to ${user.email}. Send me an expense any time, e.g. "coffee 45, lunch 120".`);
  });

  instance.help(async (ctx) => ctx.reply(HELP_TEXT));

  instance.command('stats', async (ctx) => {
    const user = await getLinkedUser(ctx.chat.id);
    if (!user) return ctx.reply(NOT_LINKED_MSG);
    const stats = await getDashboardStats(user.id);
    await ctx.reply(formatStats(stats, user.currency));
  });

  instance.command('budgets', async (ctx) => {
    const user = await getLinkedUser(ctx.chat.id);
    if (!user) return ctx.reply(NOT_LINKED_MSG);
    const { budgets } = await getFinanceContext(user.id);
    await ctx.reply(formatBudgets(budgets, user.currency));
  });

  instance.command('recent', async (ctx) => {
    const user = await getLinkedUser(ctx.chat.id);
    if (!user) return ctx.reply(NOT_LINKED_MSG);
    const { expenses } = await expenseModel.findByUser(user.id, { limit: 8, sortBy: 'date', sortDir: 'DESC' });
    await ctx.reply(formatRecent(expenses, user.currency));
  });

  instance.command('ask', async (ctx) => {
    const user = await getLinkedUser(ctx.chat.id);
    if (!user) return ctx.reply(NOT_LINKED_MSG);

    const question = ctx.message.text.replace(/^\/ask(@\S+)?\s*/i, '').trim();
    if (!question) return ctx.reply('Ask me something, e.g. /ask am I on track with my budgets?');

    try {
      const context = await getFinanceContext(user.id);
      const answer = await answerQuestion(question, context, null, user.currency);
      await ctx.reply(answer);
    } catch (err) {
      console.error('[telegram] /ask failed', err);
      await ctx.reply('Sorry, something went wrong answering that. Please try again.');
    }
  });

  instance.command('goals', async (ctx) => {
    const user = await getLinkedUser(ctx.chat.id);
    if (!user) return ctx.reply(NOT_LINKED_MSG);
    const goals = await goalModel.findByUser(user.id);
    await ctx.reply(formatGoals(goals, user.currency));
  });

  instance.command('networth', async (ctx) => {
    const user = await getLinkedUser(ctx.chat.id);
    if (!user) return ctx.reply(NOT_LINKED_MSG);
    const homeCurrency = user.accounts_currency || user.currency;
    const netWorth = await accountService.getNetWorth(user.id, homeCurrency);
    await ctx.reply(formatNetWorth(netWorth));
  });

  instance.command('currency', async (ctx) => {
    const user = await getLinkedUser(ctx.chat.id);
    if (!user) return ctx.reply(NOT_LINKED_MSG);

    const args = ctx.message.text.replace(/^\/currency(@\S+)?\s*/i, '').trim();
    const match = args.match(/^([\d.,]+)\s*([a-zA-Z]{3,4})(?:\s+to)?(?:\s+([a-zA-Z]{3,4}))?$/i);
    if (!match) {
      return ctx.reply('Usage: /currency 100 usd to egp (or /currency 100 usd to use your home currency)');
    }

    const amount = parseFloat(match[1].replace(/,/g, ''));
    const from = match[2].toUpperCase();
    const to = (match[3] || user.currency).toUpperCase();
    if (isNaN(amount)) return ctx.reply('That amount doesn\'t look right — try /currency 100 usd to egp');

    try {
      const { rates } = await ratesService.getRates(from);
      const rate = parseFloat(rates[to]);
      if (isNaN(rate)) return ctx.reply(`I don't have a rate for ${to}.`);
      const converted = amount * rate;
      await ctx.reply(`${fmtAmount(amount)} ${from} = ${fmtAmount(converted)} ${to}\n(1 ${from} = ${rate} ${to})`);
    } catch (err) {
      console.error('[telegram] /currency failed', err);
      await ctx.reply('Sorry, exchange rates are unavailable right now. Try again later.');
    }
  });

  instance.command('undo', async (ctx) => {
    const chatId = ctx.chat.id;
    const link = await queryOne('SELECT user_id, last_expense_ids FROM telegram_links WHERE chat_id = $1', [chatId]);
    if (!link) return ctx.reply(NOT_LINKED_MSG);
    if (!link.last_expense_ids?.length) {
      return ctx.reply('Nothing to undo — I don\'t have a recently confirmed batch from this chat.');
    }

    const result = await execute(
      'DELETE FROM expenses WHERE id = ANY($1) AND user_id = $2',
      [link.last_expense_ids, link.user_id]
    );
    await execute('UPDATE telegram_links SET last_expense_ids = NULL WHERE chat_id = $1', [chatId]);
    await invalidateInsightCache(link.user_id);

    await ctx.reply(`↩️ Removed ${result.rowCount} expense${result.rowCount === 1 ? '' : 's'} from your last confirmation.`);
  });

  instance.on('text', async (ctx) => {
    const chatId = ctx.chat.id;
    const text = ctx.message.text.trim();
    if (!text) return;

    const user = await getLinkedUser(chatId);
    if (!user) return ctx.reply(NOT_LINKED_MSG);

    const categories = await categoryModel.findByUser(user.id);
    const session = await getSession(chatId);

    let expenses;
    try {
      expenses = session
        ? await reviseExpenses(session.pending_expenses, text, user.currency, categories)
        : await parseExpenses(text, null, user.currency, categories);
    } catch (err) {
      console.error('[telegram] AI parse failed', err);
      return ctx.reply('Sorry, something went wrong parsing that. Please try again.');
    }

    if (!Array.isArray(expenses) || !expenses.length) {
      await clearSession(chatId);
      return ctx.reply('I couldn\'t find any expenses in that message — try again with something like "coffee 45, lunch 120".');
    }

    await saveSession(chatId, expenses);
    await ctx.reply(formatExpenseList(expenses, user.currency), confirmKeyboard);
  });

  instance.action('confirm_expenses', async (ctx) => {
    const chatId = ctx.chat.id;
    const user = await getLinkedUser(chatId);
    const session = await getSession(chatId);
    await ctx.answerCbQuery();

    if (!user || !session) {
      return ctx.editMessageText('This plan has expired. Send a new message to start over.');
    }

    const created = await createExpenses(user.id, session.pending_expenses);
    await clearSession(chatId);
    await execute('UPDATE telegram_links SET last_expense_ids = $1 WHERE chat_id = $2', [created.map(e => e.id), chatId]);

    const total = created.reduce((s, e) => s + Number(e.amount || 0), 0);
    await ctx.editMessageText(`✅ Recorded ${created.length} expense${created.length === 1 ? '' : 's'}, total ${fmtAmount(total)} ${user.currency}.`);
  });

  instance.action('cancel_expenses', async (ctx) => {
    await clearSession(ctx.chat.id);
    await ctx.answerCbQuery();
    await ctx.editMessageText('❌ Cancelled. Send a new message anytime.');
  });

  return instance;
}

function getBot() {
  if (!BOT_TOKEN) return null;
  if (!bot) bot = createBot();
  return bot;
}

async function launch() {
  const instance = getBot();
  if (!instance) {
    console.log('[telegram] TELEGRAM_BOT_TOKEN not set — bot disabled');
    return;
  }

  try {
    await instance.telegram.setMyCommands([
      { command: 'stats',    description: "This month's spending summary" },
      { command: 'budgets',  description: 'Budget status for this month' },
      { command: 'recent',   description: 'Your last few expenses' },
      { command: 'goals',    description: 'Savings goal progress' },
      { command: 'networth', description: 'Assets minus liabilities' },
      { command: 'currency', description: 'Quick FX conversion' },
      { command: 'undo',     description: 'Remove your last confirmed expenses' },
      { command: 'ask',      description: 'Ask a question about your finances' },
      { command: 'help',     description: 'Show what I can do' },
    ]);

    if (process.env.TELEGRAM_MODE === 'polling') {
      await instance.launch();
      console.log('[telegram] Bot running in long-polling mode');
    } else {
      const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
      const domain = process.env.DOMAIN;
      if (!secret || !domain) {
        console.log('[telegram] TELEGRAM_WEBHOOK_SECRET/DOMAIN not set — skipping webhook registration');
        return;
      }
      await instance.telegram.setWebhook(`https://${domain}/api/telegram/webhook/${secret}`);
      console.log('[telegram] Webhook registered');
    }
  } catch (err) {
    console.error('[telegram] Failed to start bot', err);
  }
}

module.exports = { getBot, launch };
