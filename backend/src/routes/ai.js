const router = require('express').Router();
const auth = require('../middleware/auth');
const userModel = require('../models/userModel');
const categoryModel = require('../models/categoryModel');
const { parseExpenses } = require('../services/aiService');

router.post('/parse', auth, async (req, res, next) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: 'Text is required' });

    const user = userModel.findById(req.user.userId);
    if (!user.claude_api_key) {
      return res.status(402).json({ error: 'No Claude API key configured. Please add one in Settings.' });
    }

    const categories = categoryModel.findByUser(req.user.userId);
    const expenses = await parseExpenses(text, user.claude_api_key, user.currency, categories);
    res.json({ expenses });
  } catch (err) {
    if (err.status === 401 || err.message?.includes('authentication')) {
      return res.status(502).json({ error: 'Invalid Claude API key. Please check your key in Settings.' });
    }
    next(err);
  }
});

module.exports = router;
