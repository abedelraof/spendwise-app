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
  const apiKey = decrypt(encryptedKey);
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

module.exports = { parseExpenses, generateInsight, mapCsvColumns, answerQuestion };
