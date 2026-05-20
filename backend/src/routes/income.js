const router  = require('express').Router();
const auth    = require('../middleware/auth');
const { query, queryOne, execute, pool } = require('../db/database');

const SOURCES = ['Salary', 'Business', 'Freelance', 'Investment', 'Rental', 'Gift', 'Other'];

router.get('/', auth, async (req, res, next) => {
  try {
    const { startDate, endDate, source, search, limit = 20, offset = 0 } = req.query;
    const conditions = ['user_id = $1'];
    const params = [req.user.userId]; let idx = 2;
    if (startDate) { conditions.push(`date >= $${idx++}`); params.push(startDate); }
    if (endDate)   { conditions.push(`date <= $${idx++}`); params.push(endDate); }
    if (source)    { conditions.push(`source = $${idx++}`); params.push(source); }
    if (search)    {
      conditions.push(`(description ILIKE $${idx} OR notes ILIKE $${idx})`);
      params.push(`%${search}%`); idx++;
    }
    const where = conditions.join(' AND ');
    const [countRow, rows] = await Promise.all([
      queryOne(`SELECT COUNT(*)::int AS cnt FROM incomes WHERE ${where}`, params),
      query(
        `SELECT * FROM incomes WHERE ${where} ORDER BY date DESC, created_at DESC LIMIT $${idx++} OFFSET $${idx}`,
        [...params, Number(limit), Number(offset)]
      ),
    ]);
    res.json({ incomes: rows, total: countRow.cnt });
  } catch (err) { next(err); }
});

router.post('/', auth, async (req, res, next) => {
  try {
    const { incomes } = req.body;
    if (!Array.isArray(incomes) || !incomes.length)
      return res.status(400).json({ error: 'incomes array required' });

    const client = await pool.connect();
    const ids = [];
    try {
      await client.query('BEGIN');
      for (const inc of incomes) {
        if (!inc.amount || !inc.date) continue;
        const r = await client.query(
          `INSERT INTO incomes (user_id, amount, currency, exchange_rate, date, source, description, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
          [
            req.user.userId, parseFloat(inc.amount),
            inc.currency ?? 'EGP',
            typeof inc.exchange_rate === 'number' ? inc.exchange_rate : 1.0,
            inc.date,
            SOURCES.includes(inc.source) ? inc.source : 'Other',
            inc.description ?? null,
            inc.notes ?? null,
          ]
        );
        ids.push(r.rows[0].id);
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    const created = await Promise.all(ids.map(id => queryOne('SELECT * FROM incomes WHERE id = $1', [id])));
    res.status(201).json({ created });
  } catch (err) { next(err); }
});

router.put('/:id', auth, async (req, res, next) => {
  try {
    const { amount, currency, exchange_rate, date, source, description, notes } = req.body;
    const fields = []; const vals = []; let idx = 1;
    if (amount        !== undefined) { fields.push(`amount = $${idx++}`);        vals.push(parseFloat(amount)); }
    if (currency      !== undefined) { fields.push(`currency = $${idx++}`);      vals.push(currency); }
    if (exchange_rate !== undefined) { fields.push(`exchange_rate = $${idx++}`); vals.push(exchange_rate); }
    if (date          !== undefined) { fields.push(`date = $${idx++}`);          vals.push(date); }
    if (source        !== undefined) { fields.push(`source = $${idx++}`);        vals.push(SOURCES.includes(source) ? source : 'Other'); }
    if (description   !== undefined) { fields.push(`description = $${idx++}`);   vals.push(description ?? null); }
    if (notes         !== undefined) { fields.push(`notes = $${idx++}`);         vals.push(notes ?? null); }
    if (!fields.length) return res.status(400).json({ error: 'No fields to update' });
    vals.push(req.params.id, req.user.userId);
    const result = await execute(
      `UPDATE incomes SET ${fields.join(', ')} WHERE id = $${idx++} AND user_id = $${idx}`,
      vals
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Income record not found' });
    res.json({ income: await queryOne('SELECT * FROM incomes WHERE id = $1', [req.params.id]) });
  } catch (err) { next(err); }
});

router.delete('/:id', auth, async (req, res, next) => {
  try {
    const result = await execute(
      'DELETE FROM incomes WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.userId]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Income record not found' });
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
