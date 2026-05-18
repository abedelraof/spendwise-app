const router = require('express').Router();
const auth = require('../middleware/auth');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const userModel = require('../models/userModel');
const expenseModel = require('../models/expenseModel');
const { matchOrCreateCategory } = require('../services/categoryService');
const { mapCsvColumns } = require('../services/aiService');
const { todayISO } = require('../utils/dateUtils');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.post('/preview', auth, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'CSV file required' });

    const user = userModel.findById(req.user.userId);
    const records = parse(req.file.buffer, { columns: true, skip_empty_lines: true });
    if (!records.length) return res.status(400).json({ error: 'CSV file is empty' });

    const headers = Object.keys(records[0]);
    const sampleRows = records.slice(0, 3);

    let suggestedMapping = { amount: null, date: null, description: null, category: null, currency: null };
    if (user.claude_api_key) {
      suggestedMapping = await mapCsvColumns(headers, sampleRows, user.claude_api_key);
    } else {
      const lower = headers.map(h => h.toLowerCase());
      suggestedMapping.amount = headers[lower.findIndex(h => h.includes('amount') || h.includes('price'))] || null;
      suggestedMapping.date = headers[lower.findIndex(h => h.includes('date'))] || null;
      suggestedMapping.description = headers[lower.findIndex(h => h.includes('desc') || h.includes('note') || h.includes('name'))] || null;
      suggestedMapping.category = headers[lower.findIndex(h => h.includes('cat'))] || null;
    }

    res.json({ rows: records.slice(0, 10), headers, suggestedMapping, totalRows: records.length });
  } catch (err) { next(err); }
});

router.post('/confirm', auth, (req, res, next) => {
  try {
    const { rows, mapping } = req.body;
    if (!rows?.length || !mapping?.amount) {
      return res.status(400).json({ error: 'rows and mapping.amount are required' });
    }

    const userId = req.user.userId;
    let created = 0, skipped = 0;

    const expenses = [];
    for (const row of rows) {
      const rawAmount = parseFloat(row[mapping.amount]);
      if (!rawAmount || rawAmount <= 0) { skipped++; continue; }

      const { category_id, subcategory_id } = matchOrCreateCategory(
        userId,
        mapping.category ? row[mapping.category] : 'Other',
        null
      );

      expenses.push({
        amount: rawAmount,
        currency: mapping.currency ? (row[mapping.currency] || 'EGP') : 'EGP',
        date: mapping.date ? (row[mapping.date] || todayISO()) : todayISO(),
        description: mapping.description ? row[mapping.description] : null,
        category_id, subcategory_id,
        raw_text: JSON.stringify(row),
      });
      created++;
    }

    if (expenses.length) expenseModel.insertMany(userId, expenses);
    res.json({ created, skipped });
  } catch (err) { next(err); }
});

module.exports = router;
