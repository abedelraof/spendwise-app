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

Respond with ONLY a single JSON object — no markdown, no code fences, no explanation — in exactly one of these three shapes:

Still gathering info:
{"status":"asking","message":"<one short question>","quick_replies":["<option>","<option>"]}

Done logging:
{"status":"concluded","message":"<short friendly summary>","expenses":[{"description":"string","amount":number,"currency":"${userCurrency}","category":"string","date":"YYYY-MM-DDT00:00:00.000Z"}]}

Deletion request resolved:
{"status":"delete_intent","message":"<confirmation-style summary of scope>","filter":{"start_date":"YYYY-MM-DD"|null,"end_date":"YYYY-MM-DD"|null,"category":"string"|null}}`;
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

  if (result.status !== 'asking' && result.status !== 'concluded') {
    return { status: 'asking', message: 'Could you tell me more about that expense?', quick_replies: [] };
  }
  return result;
}

module.exports = { parseExpenses, reviseExpenses, generateInsight, mapCsvColumns, answerQuestion, converseExpenses };
