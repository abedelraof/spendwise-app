const crypto = require('crypto');
const router = require('express').Router();
const auth = require('../middleware/auth');
const userModel = require('../models/userModel');
const categoryModel = require('../models/categoryModel');
const { parseExpenses, answerQuestion, converseExpenses, PROMPT_VERSION } = require('../services/aiService');
const { query, execute } = require('../db/database');
const { getFinanceContext } = require('../services/expenseService');

function getResetDate() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 10);
}

function getCacheKey(userId, text) {
  // Prefixed with PROMPT_VERSION so a prompt-template change (aiService.js) invalidates
  // cached responses instead of leaving stale pre-fix answers to replay for up to 24h.
  return crypto.createHash('sha256').update(`${PROMPT_VERSION}:${userId}:${text}`).digest('hex');
}

// AI is free for every user (no plan gate). A per-user monthly cap remains as a
// cost guard on the shared Claude API key — cached hits don't count toward it.
async function enforceAiQuota(req, res, next) {
  const user = await userModel.findById(req.user.userId);
  if (!user) return res.status(401).json({ error: 'User not found' });
  if (user.ai_used_this_month >= 100) {
    return res.status(429).json({ error: 'quota_exceeded', message: 'Monthly AI limit reached.', reset_date: getResetDate() });
  }
  req.aiUser = user;
  next();
}

async function getCachedResponse(cacheKey) {
  const rows = await query(
    `SELECT response_json FROM ai_parse_cache
     WHERE cache_key = $1 AND created_at > NOW() - INTERVAL '1 day'`,
    [cacheKey]
  );
  return rows.length ? JSON.parse(rows[0].response_json) : null;
}

async function setCachedResponse(cacheKey, data) {
  await execute(
    `INSERT INTO ai_parse_cache (cache_key, response_json)
     VALUES ($1, $2)
     ON CONFLICT (cache_key) DO UPDATE SET response_json = EXCLUDED.response_json, created_at = NOW()`,
    [cacheKey, JSON.stringify(data)]
  );
}

async function incrementAiUsage(userId) {
  await execute(
    `UPDATE users SET ai_used_this_month = ai_used_this_month + 1 WHERE id = $1`,
    [userId]
  );
}

router.post('/parse', auth, enforceAiQuota, async (req, res, next) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: 'Text is required' });

    const userId = req.user.userId;
    const cacheKey = getCacheKey(userId, text.trim());
    const cached = await getCachedResponse(cacheKey);
    if (cached) return res.json({ ...cached, cached: true });

    const categories = await categoryModel.findByUser(userId);
    const expenses = await parseExpenses(text, null, req.aiUser.currency, categories);
    const result = { expenses };

    await setCachedResponse(cacheKey, result);
    await incrementAiUsage(userId);

    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/ask', auth, enforceAiQuota, async (req, res, next) => {
  try {
    const { question } = req.body;
    if (!question?.trim()) return res.status(400).json({ error: 'Question is required' });

    const userId = req.user.userId;
    const cacheKey = getCacheKey(userId, question.trim());
    const cached = await getCachedResponse(cacheKey);
    if (cached) return res.json({ ...cached, cached: true });

    const context = await getFinanceContext(userId);
    const answer = await answerQuestion(question.trim(), context, null, req.aiUser.currency);
    const result = { answer };

    await setCachedResponse(cacheKey, result);
    await incrementAiUsage(userId);

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Statuses every client has always understood. A client that says nothing
// about its capabilities is an older build and gets exactly these.
const LEGACY_STATUSES = ['asking', 'concluded', 'delete_intent'];

// What an older client is told instead, when the conversation resolves to
// something it has no UI to finish. Rendering the intent message alone would
// be worse than useless: the assistant would appear to promise an edit or a
// saved income that silently never happens, because completing those takes a
// confirmation card that build doesn't have.
const UNSUPPORTED_FALLBACK = {
  edit_intent: "I can't change transactions from this version of the app — you can edit it on the Transactions screen.",
  income_concluded: 'Logging income by chat needs a newer version of the app — you can add it on the Income screen.',
  recurring_concluded: 'Setting up recurring expenses by chat needs a newer version of the app — you can add it on the Recurring screen.',
  report_intent: 'Reports in chat need a newer version of the app — you can see them on the Reports screen.',
};

/// Downgrades a resolved conversation turn to something the calling client can
/// actually act on. Applied on the way out — to cache hits too — so the cache
/// stays shared across client versions instead of being keyed per capability.
function gateForClient(result, supports) {
  if (!result || typeof result.status !== 'string') return result;
  if (supports.includes(result.status)) return result;

  // An answer is just prose: an older client renders it fine as a plain turn,
  // so the content survives the downgrade intact.
  if (result.status === 'answering') {
    return { status: 'asking', message: result.message, quick_replies: [] };
  }

  const message = UNSUPPORTED_FALLBACK[result.status];
  if (message) return { status: 'asking', message, quick_replies: [] };

  return result;
}

router.post('/converse', auth, enforceAiQuota, async (req, res, next) => {
  try {
    const { messages, supports } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages is required' });
    }
    // Opt-in: a client declares the statuses it can complete. Absent or
    // malformed means an older build, which gets the legacy three.
    const clientSupports = Array.isArray(supports)
      ? [...new Set([...LEGACY_STATUSES, ...supports.filter(x => typeof x === 'string')])]
      : LEGACY_STATUSES;
    for (const m of messages) {
      if (!m || typeof m.content !== 'string' || !m.content.trim() || !['user', 'assistant'].includes(m.role)) {
        return res.status(400).json({ error: 'Invalid messages format' });
      }
    }

    const userId = req.user.userId;
    const cacheKey = getCacheKey(userId, JSON.stringify(messages));
    const cached = await getCachedResponse(cacheKey);
    if (cached) return res.json({ ...gateForClient(cached, clientSupports), cached: true });

    const categories = await categoryModel.findByUser(userId);
    let result = await converseExpenses(messages, req.aiUser.currency, categories);
    let cacheable = true;

    // The conversation model has no access to the user's figures, so a finance
    // question comes back as an intent rather than an answer. Resolve it here,
    // against real data, and hand the client a finished answer. Both hops sit
    // inside this one request, so a question costs the user a single unit of
    // quota — same as any other turn — rather than two.
    if (result.status === 'question_intent') {
      // Answers are never cached. Unlike a parse, an answer is derived from
      // data this very conversation keeps changing — and the cache key is the
      // message history, so asking the same question in a fresh chat would
      // otherwise replay a figure from before the last few expenses were saved.
      cacheable = false;
      try {
        const context = await getFinanceContext(userId);
        const answer = await answerQuestion(result.question, context, null, req.aiUser.currency);
        result = { status: 'answering', message: answer };
      } catch (err) {
        // The logging half of the conversation still works — degrade to a
        // plain reply instead of failing the whole turn.
        console.error('converse: question_intent answering failed', err);
        result = {
          status: 'asking',
          message: "Sorry, I couldn't look that up just now — ask me again in a moment.",
          quick_replies: [],
        };
      }
    }

    // Cache the ungated result so every client version shares one cache entry.
    if (cacheable) await setCachedResponse(cacheKey, result);
    await incrementAiUsage(userId);

    res.json(gateForClient(result, clientSupports));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
