const router = require('express').Router();
const auth = require('../middleware/auth');
const db = require('../db/database');

router.get('/', auth, (req, res) => {
  const { q, limit = 10 } = req.query;
  if (!q?.trim()) return res.json({ results: [] });

  const term = `%${q.trim()}%`;
  const results = db.prepare(`
    SELECT e.id, e.amount, e.currency, e.date, e.description, e.tags, e.notes,
      c.name AS category_name, c.icon AS category_icon, c.color AS category_color,
      s.name AS subcategory_name
    FROM expenses e
    LEFT JOIN categories c ON e.category_id = c.id
    LEFT JOIN subcategories s ON e.subcategory_id = s.id
    WHERE e.user_id = ?
      AND (e.description LIKE ? OR e.notes LIKE ? OR e.raw_text LIKE ? OR e.tags LIKE ?)
    ORDER BY e.date DESC
    LIMIT ?
  `).all(req.user.userId, term, term, term, term, Number(limit));

  res.json({ results });
});

module.exports = router;
