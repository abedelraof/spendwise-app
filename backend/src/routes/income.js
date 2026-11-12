const router  = require('express').Router();
const auth    = require('../middleware/auth');
const { query, queryOne, execute } = require('../db/database');
const { createIncomes } = require('../services/incomeService');

const SOURCES = ['Salary', 'Business', 'Freelance', 'Investment', 'Rental', 'Gift', 'Other'];

router.get('/', auth, async (req, res, next) => {
  try {
    const { startDate, endDate, source, search, sortBy, sortDir, limit = 20, offset = 0 } = req.query;
    const SORT_COLS = { date: 'date', amount: 'amount', source: 'source' };
    const col = SORT_COLS[sortBy] || 'date';
    const dir = sortDir === 'ASC' ? 'ASC' : 'DESC';

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
        `SELECT * FROM incomes WHERE ${where} ORDER BY ${col} ${dir}, created_at DESC LIMIT $${idx++} OFFSET $${idx}`,
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

    const created = await createIncomes(req.user.userId, incomes);
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
