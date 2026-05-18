const Anthropic = require('@anthropic-ai/sdk');
const { decrypt } = require('./cryptoService');
const { todayISO, yesterdayISO } = require('../utils/dateUtils');

function buildParsePrompt(userCurrency) {
  const today = todayISO();
  const yesterday = yesterdayISO();
  return `You are an expert expense parsing assistant. Extract ALL expenses from the user's input and return ONLY a JSON array — no markdown, no explanation, no code fences.

Today's date is ${today}. Yesterday was ${yesterday}. User's preferred currency: ${userCurrency}.

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

## Category Mapping
Map informal names to these exact categories. Use your best judgment:
- Food: dining out, food, restaurant, cafe, coffee, drinks, meal, takeaway, pizza, subway, watermelon, sweets, food and sweets, costa coffee, dunkin
- Health: pharmacy, medicine, doctor visit, doctor, medical, medical analysis, analysis
- Shopping: personal (when no other category fits), kids clothes, clothes, computer stuff, electronics, accessories
- Housing: rent, hotel, personal hotel, electricity, internet
- Entertainment: gifts, kids gifts, my kids gifts
- Transport: transportation, uber, taxi, metro, bus, fuel
- Education: course, tuition, books
- Utilities: mobile bill, subscriptions
- Other: support (e.g. "Mohammed Support"), transfers, anything unclear

## Subcategory hints
- "Personal Coffee" → category=Food, subcategory=Coffee
- "Personal Dining Out" → category=Food, subcategory=Dining Out
- "Personal Doctor Visit" or "Personal Medical Analysis" → category=Health, subcategory=Doctor / Medical Analysis
- "Personal Hotel" → category=Housing, subcategory=Hotel
- "Personal Computer Stuff" → category=Shopping, subcategory=Electronics
- "Personal" alone → category=Shopping, subcategory=Personal
- "Mohammed Support" → category=Other, subcategory=Support, tags=support
- "Kids Clothes" → category=Shopping, subcategory=Kids Clothes
- "My Kids Gifts" / "Kids Gifts" → category=Entertainment, subcategory=Kids Gifts

## Rules
1. date → always ISO YYYY-MM-DD
2. amount → single numeric value only (never an expression)
3. For each "+" in an amount expression, produce a separate JSON object with that number as amount
4. category → exactly one of: Food, Transport, Housing, Entertainment, Health, Shopping, Education, Utilities, Other
5. description → ≤60 char human-readable label (combine category context + amount context)
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

async function parseExpenses(rawText, encryptedApiKey, userCurrency) {
  const client = await getClient(encryptedApiKey);
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    system: buildParsePrompt(userCurrency),
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

module.exports = { parseExpenses, generateInsight, mapCsvColumns };
