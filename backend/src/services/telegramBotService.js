const { Telegraf, Markup } = require('telegraf');
const { query, queryOne, execute } = require('../db/database');
const userModel = require('../models/userModel');
const categoryModel = require('../models/categoryModel');
const { parseExpenses, reviseExpenses } = require('./aiService');
const { createExpenses } = require('./expenseService');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

let bot = null;

function fmtAmount(n) {
  return Number(n ?? 0).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatExpenseList(expenses, currency) {
  const lines = expenses.map((e, i) =>
    `${i + 1}. ${e.description || e.category} — ${fmtAmount(e.amount)} ${e.currency || currency} (${e.category}${e.subcategory ? ' / ' + e.subcategory : ''})`
  );
  const total = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  return `Here's what I parsed:\n\n${lines.join('\n')}\n\nTotal: ${fmtAmount(total)} ${currency}\n\nConfirm, or send another message to correct anything.`;
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

  instance.on('text', async (ctx) => {
    const chatId = ctx.chat.id;
    const text = ctx.message.text.trim();
    if (!text) return;

    const user = await getLinkedUser(chatId);
    if (!user) {
      return ctx.reply('Your Telegram isn\'t connected to an ExpenseBeam account yet. Open the app → Settings → Connect Telegram to link it.');
    }

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
