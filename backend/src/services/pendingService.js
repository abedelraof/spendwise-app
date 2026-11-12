const crypto = require('crypto');
const { query, queryOne, execute } = require('../db/database');
const userModel = require('../models/userModel');
const categoryModel = require('../models/categoryModel');
const expenseModel = require('../models/expenseModel');
const bucketModel = require('../models/bucketModel');
const { parseSms } = require('./aiService');
const { createExpenses } = require('./expenseService');
const { createIncomes, SOURCES: INCOME_SOURCES } = require('./incomeService');
const { getRates } = require('./ratesService');

const MAX_SMS_CHARS = 1000;
// Phone automations retry on timeouts; the same SMS text arriving again inside
// this window is the same SMS, not a second purchase.
const DEDUPE_WINDOW_MINUTES = 10;
const MAX_LIST = 200;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const COLUMNS = `id, type, amount::float AS amount, currency, date, description, category, source,
                 raw_text, status, created_at`;

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Turns one SMS into a pending transaction. Returns
//   { status: 'pending',   pending }   a candidate was queued for review
//   { status: 'duplicate', id }        identical text was queued moments ago
//   { status: 'ignored' }              not a completed transaction (OTP, promo, ...)
// Throws if the AI call itself fails, so nothing is silently dropped.
async function ingestSms(userId, rawText) {
  const smsText = String(rawText ?? '').trim().slice(0, MAX_SMS_CHARS);
  // No digits means no amount — skip the AI call entirely.
  if (!smsText || !/\d/.test(smsText)) return { status: 'ignored' };

  const textHash = crypto.createHash('sha256').update(smsText).digest('hex');
  const dup = await queryOne(
    `SELECT id FROM pending_transactions
     WHERE user_id = $1 AND text_hash = $2
       AND created_at > NOW() - ($3 || ' minutes')::interval
     LIMIT 1`,
    [userId, textHash, String(DEDUPE_WINDOW_MINUTES)]
  );
  if (dup) return { status: 'duplicate', id: dup.id };

  const [user, categories] = await Promise.all([
    userModel.findById(userId),
    categoryModel.findByUser(userId),
  ]);
  const parsed = await parseSms(smsText, user?.currency || 'EGP', categories);
  if (!parsed) return { status: 'ignored' };

  const pending = await queryOne(
    `INSERT INTO pending_transactions
       (user_id, type, amount, currency, date, description, category, source, raw_text, text_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING ${COLUMNS}`,
    [userId, parsed.type, parsed.amount, parsed.currency, parsed.date,
     parsed.description, parsed.category, parsed.source, smsText, textHash]
  );
  return { status: 'pending', pending };
}

const listPending = (userId) =>
  query(
    `SELECT ${COLUMNS} FROM pending_transactions
     WHERE user_id = $1 AND status = 'pending'
     ORDER BY created_at DESC, id DESC LIMIT ${MAX_LIST}`,
    [userId]
  );

// Validates the optional edits the user made in the review UI. Anything invalid
// is a 400 rather than being silently dropped — the user would otherwise confirm
// a transaction that does not match what they just typed.
function cleanOverrides(o = {}) {
  const out = {};
  if (o.type !== undefined) {
    if (o.type !== 'expense' && o.type !== 'income') throw new HttpError(400, 'type must be expense or income');
    out.type = o.type;
  }
  if (o.amount !== undefined) {
    const n = Number(o.amount);
    if (!Number.isFinite(n) || n <= 0) throw new HttpError(400, 'amount must be a positive number');
    out.amount = n;
  }
  if (o.currency !== undefined) {
    if (!/^[A-Za-z]{3}$/.test(String(o.currency))) throw new HttpError(400, 'currency must be a 3-letter code');
    out.currency = String(o.currency).toUpperCase();
  }
  if (o.date !== undefined) {
    if (!ISO_DATE_RE.test(String(o.date))) throw new HttpError(400, 'date must be YYYY-MM-DD');
    out.date = String(o.date);
  }
  if (o.description !== undefined) out.description = String(o.description ?? '').trim().slice(0, 200) || null;
  if (o.category !== undefined) out.category = String(o.category ?? '').trim() || null;
  if (o.source !== undefined) {
    if (!INCOME_SOURCES.includes(o.source)) throw new HttpError(400, 'invalid income source');
    out.source = o.source;
  }
  // Buckets only apply to expenses; for an income they are accepted and ignored.
  if (o.bucketIds !== undefined) {
    if (!Array.isArray(o.bucketIds) || o.bucketIds.length > 50
        || o.bucketIds.some(n => !Number.isInteger(n) || n <= 0)) {
      throw new HttpError(400, 'bucketIds must be an array of bucket ids');
    }
    out.bucketIds = [...new Set(o.bucketIds)];
  }
  return out;
}

// Reports sum amount * exchange_rate, so a non-home-currency transaction needs
// the home-currency value of one unit. Falls back to 1.0 if rates are unavailable,
// the same approximation the rest of the app uses for rate-less records.
async function exchangeRateFor(currency, homeCurrency) {
  if (currency === homeCurrency) return 1.0;
  try {
    const { rates } = await getRates(homeCurrency);
    return rates[currency] ? 1 / rates[currency] : 1.0;
  } catch {
    return 1.0;
  }
}

async function confirmPending(userId, id, overrides) {
  const edits = cleanOverrides(overrides);

  // Claim the row first: a double-click or a second device must not create the
  // transaction twice. It is handed back to 'pending' if creating it fails.
  const row = await queryOne(
    `UPDATE pending_transactions SET status = 'confirmed', resolved_at = NOW()
     WHERE id = $1 AND user_id = $2 AND status = 'pending'
     RETURNING ${COLUMNS}`,
    [id, userId]
  );
  if (!row) throw new HttpError(404, 'Pending transaction not found or already handled');

  try {
    const final = { ...row, ...edits };
    const user = await userModel.findById(userId);
    const exchange_rate = await exchangeRateFor(final.currency, user?.currency || 'EGP');

    if (final.type === 'income') {
      const created = await createIncomes(userId, [{
        amount: final.amount, currency: final.currency, exchange_rate, date: final.date,
        source: final.source || 'Other', description: final.description,
      }]);
      return { type: 'income', created: created[0] };
    }

    const created = await createExpenses(userId, [{
      amount: final.amount, currency: final.currency, exchange_rate, date: final.date,
      description: final.description, category: final.category || 'Other', raw_text: row.raw_text,
    }]);
    let expense = created[0];

    // The expense now exists, so a bucket failure must NOT hand the row back to
    // 'pending' (a retry would save it twice). Report it instead and let the user
    // assign buckets from the Buckets page. Non-owned bucket ids are dropped silently
    // by setExpenseBuckets, same as everywhere else.
    let bucketsAssigned = true;
    if (edits.bucketIds?.length) {
      try {
        await bucketModel.setExpenseBuckets(userId, expense.id, edits.bucketIds);
        expense = await expenseModel.findById(expense.id, userId);
      } catch (err) {
        console.error('[pending] bucket assignment failed:', err.message);
        bucketsAssigned = false;
      }
    }
    return { type: 'expense', created: expense, buckets_assigned: bucketsAssigned };
  } catch (err) {
    await execute(
      `UPDATE pending_transactions SET status = 'pending', resolved_at = NULL WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    throw err;
  }
}

async function rejectPending(userId, id) {
  const r = await execute(
    `UPDATE pending_transactions SET status = 'rejected', resolved_at = NOW()
     WHERE id = $1 AND user_id = $2 AND status = 'pending'`,
    [id, userId]
  );
  if (!r.rowCount) throw new HttpError(404, 'Pending transaction not found or already handled');
}

module.exports = { ingestSms, listPending, confirmPending, rejectPending, HttpError };
