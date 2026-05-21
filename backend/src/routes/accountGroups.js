const router = require('express').Router();
const auth   = require('../middleware/auth');
const { query, execute, pool } = require('../db/database');

const list = (userId) =>
  query(
    'SELECT * FROM account_groups WHERE user_id = $1 ORDER BY sort_order ASC, created_at ASC',
    [userId]
  );

// GET / — list all groups
router.get('/', auth, async (req, res, next) => {
  try {
    res.json({ groups: await list(req.user.userId) });
  } catch (err) { next(err); }
});

// POST / — create group
router.post('/', auth, async (req, res, next) => {
  try {
    const { name, icon = '📁' } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    try {
      await execute(
        'INSERT INTO account_groups (user_id, name, icon) VALUES ($1, $2, $3)',
        [req.user.userId, name.trim(), icon]
      );
    } catch (e) {
      if (e.code === '23505') return res.status(400).json({ error: 'A group with this name already exists' });
      throw e;
    }
    res.status(201).json({ groups: await list(req.user.userId) });
  } catch (err) { next(err); }
});

// PUT /reorder — reorder groups
router.put('/reorder', auth, async (req, res, next) => {
  try {
    const { order } = req.body;
    if (!Array.isArray(order) || !order.length)
      return res.status(400).json({ error: 'order array required' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const { id, sort_order } of order) {
        await client.query(
          'UPDATE account_groups SET sort_order = $1 WHERE id = $2 AND user_id = $3',
          [sort_order, id, req.user.userId]
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    res.json({ success: true });
  } catch (err) { next(err); }
});

// PUT /:id — update name/icon
router.put('/:id', auth, async (req, res, next) => {
  try {
    const { name, icon } = req.body;
    const fields = []; const vals = []; let idx = 1;
    if (name !== undefined) { fields.push(`name = $${idx++}`); vals.push(name.trim()); }
    if (icon !== undefined) { fields.push(`icon = $${idx++}`); vals.push(icon); }
    if (fields.length) {
      vals.push(req.params.id, req.user.userId);
      try {
        await execute(
          `UPDATE account_groups SET ${fields.join(', ')} WHERE id = $${idx++} AND user_id = $${idx}`,
          vals
        );
      } catch (e) {
        if (e.code === '23505') return res.status(400).json({ error: 'A group with this name already exists' });
        throw e;
      }
    }
    res.json({ groups: await list(req.user.userId) });
  } catch (err) { next(err); }
});

// DELETE /:id — delete group (accounts unlinked via ON DELETE SET NULL)
router.delete('/:id', auth, async (req, res, next) => {
  try {
    await execute(
      'DELETE FROM account_groups WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.userId]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
