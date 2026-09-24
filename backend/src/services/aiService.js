const crypto = require('crypto');
const Anthropic = require('@anthropic-ai/sdk');
const { decrypt } = require('./cryptoService');
const { todayISO, yesterdayISO } = require('../utils/dateUtils');

function buildParsePrompt(userCurrency, categories = []) {
  const today = todayISO();
  const yesterday = yesterdayISO();

  const userCategoryList = categories.map(c => {
    const subs = (c.subcategories || []).map(s => s.name).join(', ');
    return `  - "${c.name}"${subs ? ` → subcategories: ${subs}` : ''}`;
  }).join('\n');

  const userCategoryNames = categories.map(c => c.name);

  return `You are an expert expense parsing assistant. Extract ALL expenses from the user's input and return ONLY a JSON array — no markdown, no explanation, no code fences.

Today's date is ${today}. Yesterday was ${yesterday}. User's preferred currency: ${userCurrency}.

## ⚠️ RULE #1 — Match User's Own Categories First (HIGHEST PRIORITY)
The user has created these custom categories. If any word or phrase in the expense line exactly matches (case-insensitive) one of these category names, assign that category name directly — do NOT remap it using the generic mapping below.

${userCategoryList}

Examples using the user's categories:
- "Personal 400" → if "Personal" is a user category, then category="Personal", subcategory=""
- "Food 200" → if "Food" is a user category, then category="Food"
- "Personal Coffee 50" → if "Personal" is a user category, category="Personal", subcategory="Coffee"; if NOT a user category, fall back to category="Food", subcategory="Coffee"

The user's valid category names are: ${JSON.stringify(userCategoryNames)}

**Category assignment priority:**
1. If the expense clearly matches one of the user's category names above → use it exactly (case-sensitive).
2. If no user category fits well → suggest a concise, descriptive NEW category name that accurately reflects the expense type. Good examples:
   - stocks, shares, ETF, trading → "Investments"
   - Netflix, Spotify, SaaS, app subscription → "Subscriptions"
   - salary, freelance payment received → "Income"
   - gym, fitness, yoga → "Fitness"
   - flights, travel, hotel → "Travel"
   - charity, donation → "Charity"
   - car service, repair, maintenance → "Maintenance"
3. Only fall back to the user's "Other" / "Others" category as an absolute last resort when nothing more descriptive applies.

## Input Formats You Must Handle

### Format 1 — WhatsApp/Chat Messages
Lines like: [M/D/YYYY H:MM AM/PM] Name: message content

Rules for WhatsApp format:
- The date in the header [M/D/YYYY H:MM AM/PM] is the DEFAULT date for all expenses in that message block.
- If the message body contains "Date: X" or "date: X", that date overrides the header date for ALL expenses in that message block.
- "Yesterday" in a "Date:" line means the day BEFORE the message header date (not today). E.g. if header says [5/7/2026] and body says "Date: Yesterday", the expense date is 2026-05-06.
- Each [timestamp] line starts a new message block with its own default date.
- Process ALL message blocks in the input.

### Format 2 — Plain text
Natural language descriptions like "spent 150 on groceries yesterday".

## Amount Expressions
When amounts are written as addition: "200+32.35+76.69" or "795+230":
- Each number is a SEPARATE expense entry.
- All entries share the same category and date from that line.
- NEVER sum them. Example: "Transportation: 200+32.35+76" → 3 separate expenses of 200, 32.35, and 76.

## Fallback Category Mapping (use ONLY when no user category matches the input)
Map informal names to the closest user category. Use your best judgment:
- Food-related: dining out, restaurant, cafe, coffee, drinks, meal, takeaway, pizza, watermelon, sweets, costa coffee, dunkin
- Health-related: pharmacy, medicine, doctor visit, medical, analysis
- Shopping-related: clothes, computer stuff, electronics, accessories, kids clothes
- Housing-related: rent, hotel, electricity, internet, gas bill
- Entertainment-related: gifts, kids gifts, movies, games, streaming
- Transport-related: transportation, uber, taxi, metro, bus, fuel
- Education-related: course, tuition, books, stationery
- Utilities-related: mobile bill, subscriptions
- Other: support, transfers, anything unclear

## Subcategory hints (apply after category is resolved)
- "X Coffee" → subcategory=Coffee
- "X Dining Out" → subcategory=Dining Out
- "X Doctor Visit" → subcategory=Doctor
- "X Hotel" → subcategory=Hotel
- "Mohammed Support" → category=Other, subcategory=Support, tags=support
- "Kids Clothes" → subcategory=Kids Clothes
- "My Kids Gifts" / "Kids Gifts" → subcategory=Kids Gifts

## Rules
1. date → always ISO YYYY-MM-DD
2. amount → single numeric value only (never an expression)
3. For each "+" in an amount expression, produce a separate JSON object with that number as amount
4. category → use a user category if it clearly fits; otherwise suggest a descriptive new name (never leave blank)
5. description → ≤60 char human-readable label
6. raw_text → the specific line or portion that produced this expense
7. tags → optional comma-separated tags or empty string
8. currency → use ${userCurrency} if not specified
9. No expenses found → return []

Output — JSON array only (example):
[{"amount":200.00,"currency":"${userCurrency}","date":"${today}","category":"Transport","subcategory":"Transportation","description":"Transportation","raw_text":"Transportation : 200+32.35","tags":""},
 {"amount":32.35,"currency":"${userCurrency}","date":"${today}","category":"Transport","subcategory":"Transportation","description":"Transportation","raw_text":"Transportation : 200+32.35","tags":""}]`;
}

function buildRevisePrompt(pendingExpenses, userCurrency, categories = []) {
  const today = todayISO();
  const userCategoryList = categories.map(c => {
    const subs = (c.subcategories || []).map(s => s.name).join(', ');
    return `  - "${c.name}"${subs ? ` → subcategories: ${subs}` : ''}`;
  }).join('\n');
  const userCategoryNames = categories.map(c => c.name);

  return `You are an expert expense parsing assistant helping a user correct a pending list of expenses inside a chat conversation. Today's date is ${today}. User's preferred currency: ${userCurrency}.

Here is the CURRENT pending list of expenses (JSON), not yet saved:
${JSON.stringify(pendingExpenses, null, 2)}

The user's next message is a correction or addition to apply to this list — e.g. "actually lunch was 150", "remove the coffee", "add a 50 EGP taxi too". Apply ONLY the change(s) implied by their message; leave every other expense in the list untouched.

The user's custom categories are:
${userCategoryList}
Valid category names: ${JSON.stringify(userCategoryNames)}
Use the same category-matching rules as normal parsing: prefer an exact (case-insensitive) match to one of the user's categories; otherwise suggest a concise descriptive new category name.

Return ONLY a JSON array — no markdown, no explanation, no code fences — containing the FULL corrected list of expenses (not just the changed ones), using this exact schema per item:
{"amount":number,"currency":"${userCurrency}","date":"YYYY-MM-DD","category":"string","subcategory":"string","description":"string (≤60 chars)","raw_text":"string","tags":"string"}`;
}

function buildConversePrompt(userCurrency, categories = []) {
  const today = todayISO();
  const userCategoryList = categories.map(c => {
    const subs = (c.subcategories || []).map(s => s.name).join(', ');
    return `  - "${c.name}"${subs ? ` → subcategories: ${subs}` : ''}`;
  }).join('\n');
  const userCategoryNames = categories.map(c => c.name);

  return `You are a friendly assistant helping a user log one or more expenses through natural back-and-forth conversation. Today's date is ${today}. User's preferred currency: ${userCurrency}.

Look at the whole conversation so far and decide whether you have enough information to conclude, or need to ask one more clarifying question.

## Required fields per expense
- amount (number) — REQUIRED, must be confidently known before concluding
- description (short string) — REQUIRED, must be confidently known before concluding
- category — ask about it only if genuinely ambiguous; otherwise infer your best match
- currency — NEVER ask about this; default to ${userCurrency} if not stated
- date — NEVER ask about this; default to today (${today}) if not stated

## User's existing categories (prefer an exact case-insensitive match; otherwise suggest a concise descriptive new one)
${userCategoryList || '  (none yet)'}
Valid category names: ${JSON.stringify(userCategoryNames)}

## Rules
1. Ask AT MOST one concise question per turn, and only about a genuinely missing/ambiguous amount, description, or category.
2. Never ask about currency or date — always default them silently.
3. The user may describe multiple expenses across the conversation — track all of them.
4. Once amount + description are confidently known for every expense mentioned, and category is resolved as well as it reasonably can be, conclude — don't keep asking for polish.
5. When asking, you may suggest 2-4 short "quick_replies" the user could tap instead of typing (e.g. likely category names). Omit or use [] when nothing sensible fits.
6. When concluding, write one short friendly sentence and list every expense discussed in the conversation (not just the most recent one).

## Deletion requests (status=delete_intent)
The user may instead ask to DELETE existing transactions rather than log new ones (e.g. "delete my coffee expenses last week", "clear this month's transactions", "remove everything from September").

Classify a turn as delete_intent ONLY on unambiguous deletion language — "delete", "clear", "remove", "get rid of" (or a clear synonym) combined with a scope. A question about spending ("what did I spend this month", "how much on coffee") is a READ query, not deletion — NEVER classify it as delete_intent. If the deletion scope is ambiguous (no clear date range or category), respond with status=asking and ask a clarifying question instead of guessing — under-triggering delete_intent is far safer than over-triggering, since it drives an irreversible action downstream.

**delete_intent is a terminal result for that request, exactly like concluded is for logging — it is NOT an open question waiting on a follow-up.** Once you (in an earlier turn of this same conversation) resolved a request to delete_intent, that request is done: the client takes it from there on its own (independent count-check + confirm dialog). Do NOT treat the user's next message as refining, continuing, or answering that prior delete_intent unless it ITSELF independently contains unambiguous deletion language per the rule above — regardless of what immediately preceded it. In particular, a short "description/category + amount" message (e.g. "transportation 100", "coffee 45") is ALWAYS a new expense to log, never a continuation of an earlier deletion request, even if your own previous reply in the conversation was a delete_intent confirmation. When in doubt whether a new message continues a prior delete_intent or starts something unrelated, treat it as unrelated and classify it fresh under the normal asking/concluded rules above — the false-positive direction (wrongly re-triggering delete_intent) is the dangerous one here, not the false-negative one.

(This only concerns a PRIOR delete_intent reply. A prior status=asking clarifying question about deletion scope — e.g. "which week did you mean?" — is a genuinely open question, and the user's next reply SHOULD be read as answering it, even without repeating deletion keywords.)

When you do classify delete_intent, resolve a filter:
- start_date / end_date — ISO YYYY-MM-DD (date only, no time), computed relative to today (${today}). Use null for a field with no lower/upper bound the user implied (rare — most deletion requests imply a bounded range like "this month" or "last week").
- category — if the user named a category or something that maps to one, resolve it to the EXACT string from the user's valid category names above (case-sensitive match to the list); if nothing in the input maps to a real category, use null. Never invent a category name that isn't in the user's list.
- message — a short, human-readable confirmation-style summary of the resolved scope, e.g. "You want to clear all transactions from September 2026?" or "Delete your Food & Dining expenses from the last 7 days?". This is shown as a chat bubble, NOT itself a confirmation dialog — the client always independently counts the real matches and shows its own Cancel/Delete dialog afterward, so you never need to know or state a count.

## Questions about their finances (status=question_intent)
The user may ask a READ question about money they've already recorded — "how much did I spend on food this month", "what's my biggest category", "am I over budget", "how much did I earn in August", "what did I spend yesterday".

You do NOT have their financial data in this conversation, so never attempt an answer or a number yourself. Classify the turn as question_intent and restate the question; the server answers it separately against their real figures.

Restate the question so it stands alone, folding in anything it inherits from earlier turns — "what about last month?" following a question about food becomes "how much did I spend on food last month?". The answering step sees only this one restated string, never the conversation.

A question is never a deletion (see the delete rules above) and never an expense to log.

## Editing an existing transaction (status=edit_intent)
The user may ask to CHANGE something already recorded — "change yesterday's coffee to 80", "the taxi was actually 150", "rename that lunch to team lunch", "move my Uber to Transport".

Only for transactions already logged BEFORE this conversation. An expense the user is describing right now, or one still sitting in an unconfirmed review card, is normal logging — keep those under asking/concluded.

Resolve two things:
- filter — which existing transactions to change: start_date / end_date (ISO YYYY-MM-DD relative to today, null if unbounded), category (EXACT string from the valid list, else null), and match (a short distinctive word or two from the description to search for, e.g. "coffee", else null). Give at least one of these; if the user's reference is too vague to narrow at all ("change my expense"), use status=asking instead.
- changes — what to set. Include ONLY the fields the user actually wants changed: amount (number), description (string), category (EXACT string from the valid list), date (ISO YYYY-MM-DD). At least one is required.

The client independently looks up what matches and shows the user a before/after confirmation, so never state a count and never claim the change is done — write the message as a proposal ("Change yesterday's coffee to 80 EGP?").

## Logging income (status=income_concluded)
Money coming IN, not going out — "got my salary 15000", "client paid me 3000 today", "made 500 selling my old phone".

Each income needs amount (number) and source, where source is EXACTLY one of: "Salary", "Business", "Freelance", "Investment", "Rental", "Gift", "Other". Pick the closest; use "Other" when nothing fits. description is optional free text, date defaults to today (${today}), currency defaults to ${userCurrency}. Ask (status=asking) only if the amount is genuinely unknown.

## Recurring expenses (status=recurring_concluded)
A charge that REPEATS on a schedule — "add my 200 gym membership every month", "netflix 120 monthly", "I pay rent 5000 on the 1st".

Needs amount (number), interval (EXACTLY one of "daily", "weekly", "monthly"), and next_due_date (ISO YYYY-MM-DD, the next time it is due — compute it relative to today (${today}); default to today if the user gives no timing). description and category are optional and follow the same category rules as expenses. If the user names no interval and none is obvious, ask.

A one-off past purchase is NOT recurring — "I paid rent 5000" is an expense; "I pay rent 5000 every month" is recurring.

## Reports (status=report_intent)
The user may ask for their spending report or summary card — "send me my report", "show this week's summary", "report for today".

period must be EXACTLY one of: "today", "yesterday", "week", "month". These are the only periods that exist. "this month" → "month"; "this week" / "last 7 days" → "week". If they ask for a period that isn't one of these (a specific month, last month, a custom range, a year), do NOT guess a near-miss — use status=asking and tell them which periods are available.

A request for a report is not a question to answer (question_intent) — it returns a rendered card, not prose.

## Choosing between all of these
Expense logging is the default. Reach for another status only when the user's words clearly call for it. When genuinely torn between logging and anything else, log — it is the only one the user can review and correct before it takes effect.

Respond with ONLY a single JSON object — no markdown, no code fences, no explanation — in exactly one of these shapes:

Still gathering info:
{"status":"asking","message":"<one short question>","quick_replies":["<option>","<option>"]}

Done logging:
{"status":"concluded","message":"<short friendly summary>","expenses":[{"description":"string","amount":number,"currency":"${userCurrency}","category":"string","date":"YYYY-MM-DDT00:00:00.000Z"}]}

Deletion request resolved:
{"status":"delete_intent","message":"<confirmation-style summary of scope>","filter":{"start_date":"YYYY-MM-DD"|null,"end_date":"YYYY-MM-DD"|null,"category":"string"|null}}

A question about their finances:
{"status":"question_intent","question":"<the question, restated to stand alone>"}

Edit request resolved:
{"status":"edit_intent","message":"<proposal-style summary>","filter":{"start_date":"YYYY-MM-DD"|null,"end_date":"YYYY-MM-DD"|null,"category":"string"|null,"match":"string"|null},"changes":{"amount":number,"description":"string","category":"string","date":"YYYY-MM-DD"}}

Done logging income:
{"status":"income_concluded","message":"<short friendly summary>","incomes":[{"amount":number,"currency":"${userCurrency}","source":"Salary","description":"string","date":"YYYY-MM-DD"}]}

Done setting up a recurring expense:
{"status":"recurring_concluded","message":"<short friendly summary>","recurring":{"amount":number,"currency":"${userCurrency}","category":"string","description":"string","interval":"monthly","next_due_date":"YYYY-MM-DD"}}

Report requested:
{"status":"report_intent","message":"<one short line>","period":"month"}`;
}

function buildInsightPrompt(data, userCurrency) {
  return `You are a friendly personal finance advisor. Write exactly ONE paragraph (3-5 sentences) summarizing this user's spending for the month. Be specific, mention actual numbers, highlight the biggest category, note any notable patterns. Do NOT use bullet points or headers — pure paragraph text only.

Monthly spending data (in ${userCurrency}):
${JSON.stringify(data, null, 2)}`;
}

function buildCsvMappingPrompt(headers, sampleRows) {
  return `You are a data mapping assistant. Given these CSV column headers and sample data from an expense file, identify which column maps to each expense field. Return ONLY a JSON object — no explanation.

Headers: ${JSON.stringify(headers)}
Sample rows (first 3):
${JSON.stringify(sampleRows, null, 2)}

Return JSON object with these keys (use null if no good match):
{"amount": "column_name", "date": "column_name", "description": "column_name", "category": "column_name", "currency": "column_name"}`;
}

function extractJson(text) {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1) return [];
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return []; }
}

function extractJsonObj(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) return {};
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return {}; }
}

async function getClient(encryptedKey) {
  const apiKey = encryptedKey ? decrypt(encryptedKey) : process.env.ANTHROPIC_API_KEY;
  return new Anthropic({ apiKey });
}

async function parseExpenses(rawText, encryptedApiKey, userCurrency, categories = []) {
  const client = await getClient(encryptedApiKey);
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    system: buildParsePrompt(userCurrency, categories),
    messages: [{ role: 'user', content: rawText }],
  });
  return extractJson(msg.content[0].text);
}

async function reviseExpenses(pendingExpenses, revisionText, userCurrency, categories = []) {
  const client = await getClient(null);
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    system: buildRevisePrompt(pendingExpenses, userCurrency, categories),
    messages: [{ role: 'user', content: revisionText }],
  });
  return extractJson(msg.content[0].text);
}

async function generateInsight(spendingData, encryptedApiKey, userCurrency) {
  const client = await getClient(encryptedApiKey);
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    messages: [{ role: 'user', content: buildInsightPrompt(spendingData, userCurrency) }],
  });
  return msg.content[0].text.trim();
}

async function mapCsvColumns(headers, sampleRows, encryptedApiKey) {
  const client = await getClient(encryptedApiKey);
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 256,
    messages: [{ role: 'user', content: buildCsvMappingPrompt(headers, sampleRows) }],
  });
  return extractJsonObj(msg.content[0].text);
}

function buildFinanceChatPrompt(ctx, currency) {
  const fmt = n => (n ?? 0).toLocaleString('en', { maximumFractionDigits: 0 });

  const catBreakdown = ctx.categories.length
    ? ctx.categories.map(c => `  - ${c.category ?? 'Uncategorized'}: ${fmt(c.total)} ${currency}`).join('\n')
    : '  (no data)';

  const recentExpenses = ctx.expenses.length
    ? ctx.expenses.map(e => `  ${e.date} | ${e.category ?? '-'} | ${fmt(e.amount)} ${e.currency}${e.description ? ' | ' + e.description : ''}`).join('\n')
    : '  (none)';

  const incomeLines = ctx.incomes.length
    ? ctx.incomes.map(i => `  ${i.date} | ${i.source} | ${fmt(i.amount)} ${i.currency}${i.description ? ' | ' + i.description : ''}`).join('\n')
    : '  (none)';

  const budgetLines = ctx.budgets.length
    ? ctx.budgets.map(b => `  ${b.category}: spent ${fmt(b.spent)} of ${fmt(b.budget_limit)} ${currency} (${b.budget_limit > 0 ? Math.round((b.spent / b.budget_limit) * 100) : 0}%)`).join('\n')
    : '  (none)';

  const goalLines = ctx.goals.length
    ? ctx.goals.map(g => `  ${g.name}: ${fmt(g.current_amount)} / ${fmt(g.target_amount)} ${g.target_currency}${g.target_date ? ' — target ' + g.target_date : ''}`).join('\n')
    : '  (none)';

  const accountLines = ctx.accounts.length
    ? ctx.accounts.map(a => `  ${a.name} (${a.type}): ${a.latest_balance != null ? fmt(a.latest_balance) + ' ' + a.currency : 'no snapshot'}`).join('\n')
    : '  (none)';

  const s = ctx.stats;
  return `You are a personal finance assistant. Answer the user's question using ONLY the financial data provided below. Be concise, specific, and friendly. Cite actual numbers from the data. If the answer isn't in the data, say so clearly.

## Formatting — your answer is read inside a chat bubble on a phone
The bubble is roughly 40 characters wide. Write for that, not for a screen.

- NEVER use a markdown table. At this width a three-column table wraps to one
  word — often one syllable — per line, and becomes genuinely unreadable.
- Lead with the figure that was asked for, in the first sentence.
- List the actual items rather than merging them. If the user asks what they
  spent today and there were two separate grocery runs, that is two lines — the
  detail is the point of asking, and collapsing it forces a second question.
- One item per line, shaped like "Groceries — 80 EGP". Keep each line short
  enough not to wrap.
- Bold at most the single key number. No headers, no horizontal rules, no code
  blocks, no nested bullets.
- Up to 20 lines is fine — scrolling a list is easy, re-asking for detail that
  was dropped is not. Past 20 lines, summarize instead: give the total, name the
  biggest contributors, and offer to break the rest down if they want it.

Home currency: ${currency}

## This Month Summary
- Spent: ${fmt(s.totalThisMonth)} ${currency}
- Income: ${fmt(s.incomeThisMonth)} ${currency}
- Cash flow: ${fmt(s.incomeThisMonth - s.totalThisMonth)} ${currency}
- Transactions: ${s.transactionCount}
- Top category: ${s.topCategory ?? 'N/A'}
- Daily average spend: ${fmt(s.dailyAverage)} ${currency}

## Category Breakdown (This Month)
${catBreakdown}

## Recent Expenses (last 50)
${recentExpenses}

## Recent Income (last 20)
${incomeLines}

## Budgets
${budgetLines}

## Savings Goals
${goalLines}

## Account Balances
${accountLines}`;
}

async function answerQuestion(question, context, encryptedApiKey, currency) {
  const client = await getClient(encryptedApiKey);
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: buildFinanceChatPrompt(context, currency),
    messages: [{ role: 'user', content: question }],
  });
  return msg.content[0].text.trim();
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const INCOME_SOURCES = ['Salary', 'Business', 'Freelance', 'Investment', 'Rental', 'Gift', 'Other'];
const RECURRING_INTERVALS = ['daily', 'weekly', 'monthly'];
const REPORT_PERIODS = ['today', 'yesterday', 'week', 'month'];

// Every non-logging status below drives a real write or lookup on the user's
// data, so none of the model's strings are trusted as they arrive: categories
// must exist, dates must be dates, amounts must be positive numbers, and enum
// fields must be in range. Anything that fails falls back to a plain question
// rather than reaching the client half-valid.
const asking = (message = 'Could you tell me more about that expense?') =>
  ({ status: 'asking', message, quick_replies: [] });

const isoDate = v => (typeof v === 'string' && ISO_DATE_RE.test(v) ? v : null);
const positiveAmount = v => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
const text = v => (typeof v === 'string' && v.trim() ? v.trim() : null);

function resolveCategory(value, categories) {
  const name = text(value);
  if (!name) return null;
  const match = categories.find(c => c.name.toLowerCase() === name.toLowerCase());
  return match ? match.name : null;
}

async function converseExpenses(messages, userCurrency, categories = []) {
  const client = await getClient(null);
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: buildConversePrompt(userCurrency, categories),
    messages: messages.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
  });
  const result = extractJsonObj(msg.content[0].text);

  if (result.status === 'delete_intent') {
    const f = result.filter && typeof result.filter === 'object' ? result.filter : {};
    const validCategoryNames = new Set(categories.map(c => c.name.toLowerCase()));
    // Never trust the model's category/date strings blindly — re-check against
    // the real category list and date format before this filter reaches the client.
    const category = typeof f.category === 'string' && validCategoryNames.has(f.category.toLowerCase())
      ? categories.find(c => c.name.toLowerCase() === f.category.toLowerCase()).name
      : null;
    const start_date = typeof f.start_date === 'string' && ISO_DATE_RE.test(f.start_date) ? f.start_date : null;
    const end_date = typeof f.end_date === 'string' && ISO_DATE_RE.test(f.end_date) ? f.end_date : null;
    if (typeof result.message !== 'string' || !result.message.trim()) {
      return { status: 'asking', message: 'What would you like to delete, and for what time range?', quick_replies: [] };
    }
    return { status: 'delete_intent', message: result.message, filter: { start_date, end_date, category } };
  }

  if (result.status === 'question_intent') {
    // Answered by the route against real data — the model never sees the
    // figures, so a blank question here would answer nothing.
    const question = text(result.question);
    return question ? { status: 'question_intent', question } : asking();
  }

  if (result.status === 'edit_intent') {
    const f = result.filter && typeof result.filter === 'object' ? result.filter : {};
    const filter = {
      start_date: isoDate(f.start_date),
      end_date: isoDate(f.end_date),
      category: resolveCategory(f.category, categories),
      match: text(f.match),
    };
    // With every filter field dropped this would select the user's entire
    // history — refuse rather than propose an unbounded edit.
    if (!Object.values(filter).some(v => v !== null)) {
      return asking('Which transaction should I change?');
    }

    const c = result.changes && typeof result.changes === 'object' ? result.changes : {};
    const changes = {};
    if (positiveAmount(c.amount) !== null) changes.amount = positiveAmount(c.amount);
    if (text(c.description)) changes.description = text(c.description);
    if (resolveCategory(c.category, categories)) changes.category = resolveCategory(c.category, categories);
    if (isoDate(c.date)) changes.date = isoDate(c.date);
    if (!Object.keys(changes).length) return asking('What should I change it to?');

    const message = text(result.message);
    return message ? { status: 'edit_intent', message, filter, changes } : asking();
  }

  if (result.status === 'income_concluded') {
    const raw = Array.isArray(result.incomes) ? result.incomes : [];
    const incomes = raw.map(i => {
      const amount = positiveAmount(i?.amount);
      if (amount === null) return null;
      const source = INCOME_SOURCES.find(s => s.toLowerCase() === String(i?.source ?? '').toLowerCase());
      return {
        amount,
        currency: text(i?.currency) || userCurrency,
        source: source || 'Other',
        description: text(i?.description),
        date: isoDate(i?.date) || todayISO(),
      };
    }).filter(Boolean);
    if (!incomes.length) return asking('How much was it?');
    return { status: 'income_concluded', message: text(result.message) || 'Ready to save this income:', incomes };
  }

  if (result.status === 'recurring_concluded') {
    const r = result.recurring && typeof result.recurring === 'object' ? result.recurring : {};
    const amount = positiveAmount(r.amount);
    const interval = RECURRING_INTERVALS.find(i => i === String(r.interval ?? '').toLowerCase());
    if (amount === null) return asking('How much is it each time?');
    if (!interval) return asking('How often does it repeat — daily, weekly or monthly?');
    return {
      status: 'recurring_concluded',
      message: text(result.message) || 'Ready to set this up:',
      recurring: {
        amount,
        currency: text(r.currency) || userCurrency,
        category: resolveCategory(r.category, categories),
        description: text(r.description),
        interval,
        next_due_date: isoDate(r.next_due_date) || todayISO(),
      },
    };
  }

  if (result.status === 'report_intent') {
    const period = REPORT_PERIODS.find(p => p === String(result.period ?? '').toLowerCase());
    if (!period) {
      return asking('Which period would you like — today, yesterday, this week or this month?');
    }
    return { status: 'report_intent', message: text(result.message) || 'Here it is:', period };
  }

  if (result.status !== 'asking' && result.status !== 'concluded') {
    return asking();
  }
  return result;
}

// Hashes the actual prompt-builder source (not just a manually-bumped constant) so the
// AI response cache (routes/ai.js) automatically invalidates whenever any of these
// instruction templates changes — a prior prompt fix silently kept getting shadowed by
// pre-fix cached responses for up to 24h because the cache key had no notion of this.
const PROMPT_VERSION = crypto.createHash('sha256')
  .update([buildParsePrompt, buildRevisePrompt, buildConversePrompt, buildFinanceChatPrompt].map(fn => fn.toString()).join('\n'))
  .digest('hex')
  .slice(0, 16);

module.exports = { parseExpenses, reviseExpenses, generateInsight, mapCsvColumns, answerQuestion, converseExpenses, PROMPT_VERSION };
