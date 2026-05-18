const router  = require('express').Router();
const auth    = require('../middleware/auth');
const db      = require('../db/database');

const SOURCES = ['Salary', 'Business', 'Freelance', 'Investment', 'Rental', 'Gift', 'Other'];

router.get('/', auth, (req, res) => {
  const { startDate, endDate, source, search, limit = 20, offset = 0 } = req.query;
  const conditions = ['user_id = ?'];
  const params     = [req.user.userId];
  if (startDate) { conditions.push('date >= ?'); params.push(startDate); }
  if (endDate)   { conditions.push('date <= ?'); params.push(endDate); }
  if (source)    { conditions.push('source = ?'); params.push(source); }
  if (search)    {
    conditions.push('(description LIKE ? OR notes LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }
  const where = conditions.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) AS cnt FROM incomes WHERE ${where}`).get(...params).cnt;
  const rows  = db.prepare(
    `SELECT * FROM incomes WHERE ${where} ORDER BY date DESC, created_at DESC LIMIT ? OFFSET ?`
  ).all(...params, Number(limit), Number(offset));
  res.json({ incomes: rows, total });
});

router.post('/', auth, (req, res, next) => {
  try {
    const { incomes } = req.body;
    if (!Array.isArray(incomes) || !incomes.length)
      return res.status(400).json({ error: 'incomes array required' });
    const stmt = db.prepare(`
      INSERT INTO incomes (user_id, amount, currency, exchange_rate, date, source, description, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertAll = db.transaction(() => {
      const ids = [];
      for (const inc of incomes) {
        if (!inc.amount || !inc.date) continue;
        const info = stmt.run(
          req.user.userId, parseFloat(inc.amount),
          inc.currency ?? 'EGP',
          typeof inc.exchange_rate === 'number' ? inc.exchange_rate : 1.0,
          inc.date,
          SOURCES.includes(inc.source) ? inc.source : 'Other',
          inc.description ?? null,
          inc.notes ?? null
        );
        ids.push(info.lastInsertRowid);
      }
      return ids;
    });
    const ids     = insertAll();
    const created = ids.map(id => db.prepare('SELECT * FROM incomes WHERE id = ?').get(id));
    res.status(201).json({ created });
  } catch (err) { next(err); }
});

router.put('/:id', auth, (req, res, next) => {
  try {
    const { amount, currency, exchange_rate, date, source, description, notes } = req.body;
    const fields = []; const vals = [];
    if (amount        !== undefined) { fields.push('amount = ?');        vals.push(parseFloat(amount)); }
    if (currency      !== undefined) { fields.push('currency = ?');      vals.push(currency); }
    if (exchange_rate !== undefined) { fields.push('exchange_rate = ?'); vals.push(exchange_rate); }
    if (date          !== undefined) { fields.push('date = ?');          vals.push(date); }
    if (source        !== undefined) { fields.push('source = ?');        vals.push(SOURCES.includes(source) ? source : 'Other'); }
    if (description   !== undefined) { fields.push('description = ?');   vals.push(description ?? null); }
    if (notes         !== undefined) { fields.push('notes = ?');         vals.push(notes ?? null); }
    if (!fields.length) return res.status(400).json({ error: 'No fields to update' });
    vals.push(req.params.id, req.user.userId);
    const result = db.prepare(
      `UPDATE incomes SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`
    ).run(...vals);
    if (!result.changes) return res.status(404).json({ error: 'Income record not found' });
    res.json({ income: db.prepare('SELECT * FROM incomes WHERE id = ?').get(req.params.id) });
  } catch (err) { next(err); }
});

router.delete('/:id', auth, (req, res) => {
  const result = db.prepare('DELETE FROM incomes WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.user.userId);
  if (!result.changes) return res.status(404).json({ error: 'Income record not found' });
  res.json({ success: true });
});

module.exports = router;
