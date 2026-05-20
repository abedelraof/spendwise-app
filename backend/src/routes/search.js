const router = require('express').Router();
const auth = require('../middleware/auth');
const { query } = require('../db/database');

router.get('/', auth, async (req, res, next) => {
  try {
    const { q, limit = 10 } = req.query;
    if (!q?.trim()) return res.json({ results: [] });

    const term = `%${q.trim()}%`;
    const results = await query(
      `SELECT e.id, e.amount, e.currency, e.date, e.description, e.tags, e.notes,
         c.name AS category_name, c.icon AS category_icon, c.color AS category_color,
         s.name AS subcategory_name
       FROM expenses e
       LEFT JOIN categories c ON e.category_id = c.id
       LEFT JOIN subcategories s ON e.subcategory_id = s.id
       WHERE e.user_id = $1
         AND (e.description ILIKE $2 OR e.notes ILIKE $2 OR e.raw_text ILIKE $2 OR e.tags ILIKE $2)
       ORDER BY e.date DESC
       LIMIT $3`,
      [req.user.userId, term, Number(limit)]
    );
    res.json({ results });
  } catch (err) { next(err); }
});

module.exports = router;
