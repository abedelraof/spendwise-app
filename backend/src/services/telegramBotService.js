const { Telegraf, Markup } = require('telegraf');
const { query, queryOne, execute } = require('../db/database');
const userModel = require('../models/userModel');
const categoryModel = require('../models/categoryModel');
const expenseModel = require('../models/expenseModel');
const goalModel = require('../models/goalModel');
const { parseExpenses, reviseExpenses, answerQuestion } = require('./aiService');
const { createExpenses, getDashboardStats, getFinanceContext, getRangeStats, getCategoryBreakdown, invalidateInsightCache } = require('./expenseService');
const { matchOrCreateCategory } = require('./categoryService');
const accountService = require('./accountService');
const ratesService = require('./ratesService');
const budgetService = require('./budgetService');
const { generateMonthlyInsight } = require('./insightService');
const { yesterdayISO, todayISO, getMonthRange } = require('../utils/dateUtils');

const DIGEST_VALUES = ['daily', 'weekly', 'off'];

const NOT_LINKED_MSG = 'Your Telegram isn\'t connected to an ExpenseBeam account yet. Open the app → Settings → Connect Telegram to link it.';

const HELP_TEXT = `Here's what I can do:

• Just send a message like "coffee 45, lunch 120" and I'll parse it into expenses for you to confirm.
• /stats [today|yesterday|week|month] — spending summary
• /budgets — budget status for this month
• /recent — your last few expenses
• /goals — savings goal progress
• /networth — assets minus liabilities across all accounts
• /currency <amount> <from> [to] <to> — quick FX conversion, e.g. /currency 100 usd to egp
• /undo — remove the expenses from your last confirmed message
• /digest daily|weekly|off — get a proactive spending digest (you'll also get a monthly AI insight automatically)
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

function findExistingCategory(categories, name) {
  return categories.find(c => c.name.toLowerCase() === (name || '').trim().toLowerCase());
}

// Diffs the AI-parsed expenses against the user's existing categories/subcategories
// and returns the de-duped list of ones that don't exist yet.
function detectNewCategories(expenses, categories) {
  const suggestions = [];
  const seen = new Set();

  for (const e of expenses) {
    const existingCat = findExistingCategory(categories, e.category);
    if (!existingCat) {
      const key = `cat:${(e.category || '').trim().toLowerCase()}`;
      if (!seen.has(key) && (e.category || '').trim()) {
        seen.add(key);
        suggestions.push({ category: e.category.trim(), subcategory: e.subcategory?.trim() || null, isNewCategory: true });
      }
      continue;
    }
    if (e.subcategory?.trim()) {
      const existingSub = (existingCat.subcategories || []).find(s => s.name.toLowerCase() === e.subcategory.trim().toLowerCase());
      if (!existingSub) {
        const key = `sub:${existingCat.name.toLowerCase()}:${e.subcategory.trim().toLowerCase()}`;
        if (!seen.has(key)) {
          seen.add(key);
          suggestions.push({ category: existingCat.name, subcategory: e.subcategory.trim(), isNewCategory: false });
        }
      }
    }
  }
  return suggestions;
}

function formatCategorySuggestions(suggestions) {
  const lines = suggestions.map(s => {
    if (s.isNewCategory) {
      return s.subcategory ? `🆕 ${s.category} → ${s.subcategory} (new category)` : `🆕 ${s.category} (new category)`;
    }
    return `🆕 ${s.category} → ${s.subcategory} (new subcategory)`;
  });
  const plural = suggestions.length > 1;
  return `I don't see ${plural ? 'these' : 'this'} in your categories yet:\n\n${lines.join('\n')}\n\nCreate ${plural ? 'them' : 'it'} and continue with the expenses below, or cancel to keep using only your existing categories.`;
}

// Reassigns expenses that referenced rejected new categories/subcategories back onto
// the user's existing ones, so nothing gets created when the suggestion is cancelled.
function remapToExistingCategories(expenses, categories, suggestions) {
  const newCatNames = new Set(suggestions.filter(s => s.isNewCategory).map(s => s.category.toLowerCase()));
  const newSubKeys = new Set(
    suggestions.filter(s => !s.isNewCategory).map(s => `${s.category.toLowerCase()}:${s.subcategory.toLowerCase()}`)
  );
  const fallback = categories.find(c => ['other', 'others'].includes(c.name.toLowerCase())) || categories[0];

  return expenses.map(e => {
    if (newCatNames.has((e.category || '').trim().toLowerCase())) {
      return { ...e, category: fallback ? fallback.name : e.category, subcategory: '' };
    }
    const subKey = `${(e.category || '').trim().toLowerCase()}:${(e.subcategory || '').trim().toLowerCase()}`;
    if (e.subcategory?.trim() && newSubKeys.has(subKey)) {
      return { ...e, subcategory: '' };
    }
    return e;
  });
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

function formatStatsRange(label, stats, currency, days) {
  if (stats.transactionCount === 0) return `📊 ${label}: no expenses logged.`;
  const avgLine = days > 1 ? `\nDaily average: ${fmtAmount(stats.total / days)} ${currency}` : '';
  return `📊 ${label}

Spent: ${fmtAmount(stats.total)} ${currency}
Top category: ${stats.topCategory ?? 'N/A'}
Transactions: ${stats.transactionCount}${avgLine}`;
}

function formatCategoryBreakdown(breakdown, currency) {
  if (!breakdown.length) return '';
  const lines = breakdown.map(b => `${b.category ?? 'Uncategorized'}: ${fmtAmount(b.total)} ${currency} (${b.percentage}%)`);
  return `\n\n📂 By Category\n${lines.join('\n')}`;
}

function formatMonthlyBudgetLine(totalThisMonth, capInfo, currency) {
  if (capInfo?.cap == null) {
    return `\n\nYou haven't set a monthly budget cap yet — add one from Planning in the app.`;
  }
  const pct = capInfo.cap > 0 ? Math.round((totalThisMonth / capInfo.cap) * 100) : 0;
  const emoji = pct >= 100 ? '🔴' : pct >= 80 ? '🟠' : '🟢';
  const remaining = capInfo.cap - totalThisMonth;
  const remainingLine = remaining >= 0
    ? `${fmtAmount(remaining)} ${currency} remaining`
    : `${fmtAmount(Math.abs(remaining))} ${currency} over budget`;
  return `\n\n${emoji} You've spent ${fmtAmount(totalThisMonth)} out of your ${fmtAmount(capInfo.cap)} ${currency} monthly budget (${pct}%) — ${remainingLine}.`;
}

function formatBudgets(budgets, currency, capInfo) {
  if (!budgets.length && capInfo?.cap == null) {
    return 'You don\'t have any budgets set up yet — add some from Planning in the app.';
  }

  let overallLine = '';
  if (capInfo?.cap != null) {
    const pct = capInfo.cap > 0 ? Math.round((capInfo.allocated / capInfo.cap) * 100) : 0;
    const emoji = pct >= 100 ? '🔴' : pct >= 80 ? '🟠' : '🟢';
    overallLine = `${emoji} Overall: ${fmtAmount(capInfo.allocated)} / ${fmtAmount(capInfo.cap)} ${currency} (${pct}%) — ${fmtAmount(capInfo.remaining)} remaining\n\n`;
  }

  if (!budgets.length) return `💰 Budgets This Month\n\n${overallLine}No category budgets set up yet.`;

  const lines = budgets.map(b => {
    const pct = b.budget_limit > 0 ? Math.round((b.spent / b.budget_limit) * 100) : 0;
    const emoji = pct >= 100 ? '🔴' : pct >= 80 ? '🟠' : '🟢';
    return `${emoji} ${b.category}: ${fmtAmount(b.spent)} / ${fmtAmount(b.budget_limit)} ${currency} (${pct}%)`;
  });
  return `💰 Budgets This Month\n\n${overallLine}${lines.join('\n')}`;
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

function formatDigest(label, stats, currency) {
  if (stats.transactionCount === 0) return `📅 ${label}: no expenses logged.`;
  return `📅 ${label}

Spent: ${fmtAmount(stats.total)} ${currency}
Top category: ${stats.topCategory ?? 'N/A'}
Transactions: ${stats.transactionCount}`;
}

const confirmKeyboard = Markup.inlineKeyboard([
  Markup.button.callback('✅ Confirm', 'confirm_expenses'),
  Markup.button.callback('❌ Cancel', 'cancel_expenses'),
]);

const newCategoryKeyboard = Markup.inlineKeyboard([
  Markup.button.callback('✅ Confirm', 'confirm_new_categories'),
  Markup.button.callback('❌ Cancel', 'cancel_new_categories'),
]);

async function getLinkedUser(chatId) {
  const link = await queryOne('SELECT user_id FROM telegram_links WHERE chat_id = $1', [chatId]);
  if (!link) return null;
  return userModel.findById(link.user_id);
}

async function getSession(chatId) {
  return queryOne('SELECT pending_expenses, pending_new_categories FROM telegram_sessions WHERE chat_id = $1', [chatId]);
}

async function saveSession(chatId, expenses, newCategories = null) {
  await execute(
    `INSERT INTO telegram_sessions (chat_id, pending_expenses, pending_new_categories, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (chat_id) DO UPDATE SET pending_expenses = EXCLUDED.pending_expenses, pending_new_categories = EXCLUDED.pending_new_categories, updated_at = NOW()`,
    [chatId, JSON.stringify(expenses), newCategories ? JSON.stringify(newCategories) : null]
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

    const arg = ctx.message.text.replace(/^\/stats(@\S+)?\s*/i, '').trim().toLowerCase();
    if (arg && !['month', 'today', 'yesterday', 'week'].includes(arg)) {
      return ctx.reply('Usage: /stats [today|yesterday|week|month]');
    }

    const [dashboardStats, capInfo] = await Promise.all([
      getDashboardStats(user.id),
      budgetService.getMonthlyCapInfo(user.id),
    ]);

    let periodStart, periodEnd, body;

    if (!arg || arg === 'month') {
      const now = new Date();
      ({ start: periodStart, end: periodEnd } = getMonthRange(now.getFullYear(), now.getMonth() + 1));
      body = formatStats(dashboardStats, user.currency);
    } else {
      const today = todayISO();
      let label, days;
      if (arg === 'today') {
        periodStart = periodEnd = today; label = 'Today'; days = 1;
      } else if (arg === 'yesterday') {
        periodStart = periodEnd = yesterdayISO(); label = 'Yesterday'; days = 1;
      } else {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 6);
        periodStart = weekAgo.toISOString().slice(0, 10);
        periodEnd = today; label = 'This Week'; days = 7;
      }
      const rangeStats = await getRangeStats(user.id, periodStart, periodEnd);
      body = formatStatsRange(label, rangeStats, user.currency, days);
    }

    const breakdown = await getCategoryBreakdown(user.id, periodStart, periodEnd);
    const suffix = formatCategoryBreakdown(breakdown, user.currency)
      + formatMonthlyBudgetLine(dashboardStats.totalThisMonth, capInfo, user.currency);

    await ctx.reply(body + suffix);
  });

  instance.command('budgets', async (ctx) => {
    const user = await getLinkedUser(ctx.chat.id);
    if (!user) return ctx.reply(NOT_LINKED_MSG);
    const { budgets } = await getFinanceContext(user.id);
    const capInfo = await budgetService.getMonthlyCapInfo(user.id);
    await ctx.reply(formatBudgets(budgets, user.currency, capInfo));
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

  instance.command('digest', async (ctx) => {
    const chatId = ctx.chat.id;
    const user = await getLinkedUser(chatId);
    if (!user) return ctx.reply(NOT_LINKED_MSG);

    const arg = ctx.message.text.replace(/^\/digest(@\S+)?\s*/i, '').trim().toLowerCase();
    if (!DIGEST_VALUES.includes(arg)) {
      return ctx.reply('Usage: /digest daily, /digest weekly, or /digest off');
    }

    await execute('UPDATE telegram_links SET digest_frequency = $1 WHERE chat_id = $2', [arg, chatId]);
    await ctx.reply(arg === 'off' ? 'Digest turned off.' : `You'll get a ${arg} spending digest from now on.`);
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

    const suggestions = detectNewCategories(expenses, categories);
    if (suggestions.length) {
      await saveSession(chatId, expenses, suggestions);
      return ctx.reply(formatCategorySuggestions(suggestions), newCategoryKeyboard);
    }

    await saveSession(chatId, expenses);
    await ctx.reply(formatExpenseList(expenses, user.currency), confirmKeyboard);
  });

  instance.action('confirm_new_categories', async (ctx) => {
    const chatId = ctx.chat.id;
    const user = await getLinkedUser(chatId);
    const session = await getSession(chatId);
    await ctx.answerCbQuery();

    if (!user || !session?.pending_new_categories?.length) {
      return ctx.editMessageText('This plan has expired. Send a new message to start over.');
    }

    for (const s of session.pending_new_categories) {
      await matchOrCreateCategory(user.id, s.category, s.subcategory || null);
    }

    await saveSession(chatId, session.pending_expenses);
    await ctx.editMessageText(formatExpenseList(session.pending_expenses, user.currency), confirmKeyboard);
  });

  instance.action('cancel_new_categories', async (ctx) => {
    const chatId = ctx.chat.id;
    const user = await getLinkedUser(chatId);
    const session = await getSession(chatId);
    await ctx.answerCbQuery();

    if (!user || !session?.pending_new_categories?.length) {
      return ctx.editMessageText('This plan has expired. Send a new message to start over.');
    }

    const categories = await categoryModel.findByUser(user.id);
    const remapped = remapToExistingCategories(session.pending_expenses, categories, session.pending_new_categories);

    await saveSession(chatId, remapped);
    await ctx.editMessageText(formatExpenseList(remapped, user.currency), confirmKeyboard);
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

async function sendDailyDigests() {
  const instance = getBot();
  if (!instance) return;

  const yesterday = yesterdayISO();
  const rows = await query(
    `SELECT tl.chat_id, tl.user_id, u.currency
     FROM telegram_links tl JOIN users u ON u.id = tl.user_id
     WHERE tl.digest_frequency = 'daily'`
  );

  for (const row of rows) {
    try {
      const stats = await getRangeStats(row.user_id, yesterday, yesterday);
      await instance.telegram.sendMessage(row.chat_id, formatDigest('Yesterday', stats, row.currency));
    } catch (err) {
      console.error('[telegram] daily digest failed for chat', row.chat_id, err);
    }
  }
}

async function sendWeeklyDigests() {
  const instance = getBot();
  if (!instance) return;

  const end = todayISO();
  const start = new Date();
  start.setDate(start.getDate() - 6);
  const startISO = start.toISOString().slice(0, 10);

  const rows = await query(
    `SELECT tl.chat_id, tl.user_id, u.currency
     FROM telegram_links tl JOIN users u ON u.id = tl.user_id
     WHERE tl.digest_frequency = 'weekly'`
  );

  for (const row of rows) {
    try {
      const stats = await getRangeStats(row.user_id, startISO, end);
      await instance.telegram.sendMessage(row.chat_id, formatDigest('This Week', stats, row.currency));
    } catch (err) {
      console.error('[telegram] weekly digest failed for chat', row.chat_id, err);
    }
  }
}

async function sendMonthlyInsights() {
  const instance = getBot();
  if (!instance) return;

  const prevMonth = new Date();
  prevMonth.setDate(1);
  prevMonth.setMonth(prevMonth.getMonth() - 1);
  const yearMonth = prevMonth.toISOString().slice(0, 7);

  const rows = await query('SELECT chat_id, user_id FROM telegram_links');

  for (const row of rows) {
    try {
      const { insight } = await generateMonthlyInsight(row.user_id, yearMonth);
      if (insight) {
        await instance.telegram.sendMessage(row.chat_id, `📅 Your ${yearMonth} Insight\n\n${insight}`);
      }
    } catch (err) {
      console.error('[telegram] monthly insight push failed for chat', row.chat_id, err);
    }
  }
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
      { command: 'digest',   description: 'Set up a daily/weekly spending digest' },
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

module.exports = { getBot, launch, sendDailyDigests, sendWeeklyDigests, sendMonthlyInsights };
