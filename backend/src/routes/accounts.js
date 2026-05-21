const router = require('express').Router();
const auth   = require('../middleware/auth');
const { query, queryOne, execute, pool } = require('../db/database');

const LIST_SQL = `
  SELECT a.*,
    b.balance         AS latest_balance,
    b.recorded_date   AS latest_date,
    b.quantity        AS latest_quantity,
    b.price_per_unit  AS latest_price_per_unit
  FROM accounts a
  LEFT JOIN account_balances b ON b.id = (
    SELECT id FROM account_balances
    WHERE account_id = a.id
    ORDER BY recorded_date DESC, created_at DESC LIMIT 1
  )
  WHERE a.user_id = $1
  ORDER BY a.sort_order ASC, a.created_at ASC
`;

const list = (userId) => query(LIST_SQL, [userId]);

router.get('/', auth, async (req, res, next) => {
  try {
    res.json({ accounts: await list(req.user.userId) });
  } catch (err) { next(err); }
});

router.post('/', auth, async (req, res, next) => {
  try {
    const { name, currency = 'EGP', icon = '🏦', type = 'monetary', unit = null } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    await execute(
      'INSERT INTO accounts (user_id, name, currency, icon, type, unit) VALUES ($1,$2,$3,$4,$5,$6)',
      [req.user.userId, name.trim(), currency, icon, type, unit]
    );
    res.status(201).json({ accounts: await list(req.user.userId) });
  } catch (err) { next(err); }
});

router.put('/reorder', auth, async (req, res, next) => {
  try {
    const { order } = req.body; // [{id, sort_order}]
    if (!Array.isArray(order) || !order.length)
      return res.status(400).json({ error: 'order array required' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const { id, sort_order } of order) {
        await client.query(
          'UPDATE accounts SET sort_order = $1 WHERE id = $2 AND user_id = $3',
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

router.put('/:id', auth, async (req, res, next) => {
  try {
    const { name, currency, icon, type, unit } = req.body;
    const fields = []; const vals = []; let idx = 1;
    if (name     !== undefined) { fields.push(`name = $${idx++}`);     vals.push(name.trim()); }
    if (currency !== undefined) { fields.push(`currency = $${idx++}`); vals.push(currency); }
    if (icon     !== undefined) { fields.push(`icon = $${idx++}`);     vals.push(icon); }
    if (type     !== undefined) { fields.push(`type = $${idx++}`);     vals.push(type); }
    if (unit     !== undefined) { fields.push(`unit = $${idx++}`);     vals.push(unit); }
    if (fields.length) {
      vals.push(req.params.id, req.user.userId);
      await execute(
        `UPDATE accounts SET ${fields.join(', ')} WHERE id = $${idx++} AND user_id = $${idx}`,
        vals
      );
    }
    res.json({ accounts: await list(req.user.userId) });
  } catch (err) { next(err); }
});

router.delete('/:id', auth, async (req, res, next) => {
  try {
    await execute('DELETE FROM accounts WHERE id = $1 AND user_id = $2', [req.params.id, req.user.userId]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.get('/:id/history', auth, async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 30, 100);
    const rows = await query(
      'SELECT * FROM account_balances WHERE account_id = $1 AND user_id = $2 ORDER BY recorded_date DESC, created_at DESC LIMIT $3',
      [req.params.id, req.user.userId, limit]
    );
    res.json({ history: rows });
  } catch (err) { next(err); }
});

router.post('/balances', auth, async (req, res, next) => {
  try {
    const { entries, recordedDate, notes } = req.body;
    if (!Array.isArray(entries) || !entries.length || !recordedDate)
      return res.status(400).json({ error: 'entries array and recordedDate are required' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const e of entries) {
        if (!e.accountId) continue;
        const rate = typeof e.exchangeRate === 'number' ? e.exchangeRate : 1.0;
        if (e.quantity !== undefined && e.pricePerUnit !== undefined &&
            e.quantity !== '' && e.pricePerUnit !== '') {
          const qty = parseFloat(e.quantity), ppu = parseFloat(e.pricePerUnit);
          await client.query(
            'INSERT INTO account_balances (account_id, user_id, balance, recorded_date, notes, quantity, price_per_unit, exchange_rate) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
            [e.accountId, req.user.userId, qty * ppu, recordedDate, notes ?? null, qty, ppu, rate]
          );
        } else if (e.balance !== undefined && e.balance !== '') {
          await client.query(
            'INSERT INTO account_balances (account_id, user_id, balance, recorded_date, notes, quantity, price_per_unit, exchange_rate) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
            [e.accountId, req.user.userId, parseFloat(e.balance), recordedDate, notes ?? null, null, null, rate]
          );
        }
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    res.status(201).json({ accounts: await list(req.user.userId) });
  } catch (err) { next(err); }
});

router.put('/balances/:id', auth, async (req, res, next) => {
  try {
    const { balance, quantity, price_per_unit, recorded_date, notes, exchange_rate } = req.body;
    const row = await queryOne(
      'SELECT * FROM account_balances WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.userId]
    );
    if (!row) return res.status(404).json({ error: 'Not found' });

    const fields = []; const vals = []; let idx = 1;
    if (recorded_date !== undefined) { fields.push(`recorded_date = $${idx++}`); vals.push(recorded_date); }
    if (notes         !== undefined) { fields.push(`notes = $${idx++}`);         vals.push(notes ?? null); }
    if (exchange_rate !== undefined) { fields.push(`exchange_rate = $${idx++}`); vals.push(exchange_rate); }
    if (quantity != null && price_per_unit != null) {
      const qty = parseFloat(quantity), ppu = parseFloat(price_per_unit);
      fields.push(`quantity = $${idx++}`, `price_per_unit = $${idx++}`, `balance = $${idx++}`);
      vals.push(qty, ppu, qty * ppu);
    } else if (balance != null) {
      fields.push(`balance = $${idx++}`, `quantity = $${idx++}`, `price_per_unit = $${idx++}`);
      vals.push(parseFloat(balance), null, null);
    }
    if (fields.length) {
      vals.push(req.params.id, req.user.userId);
      await execute(
        `UPDATE account_balances SET ${fields.join(', ')} WHERE id = $${idx++} AND user_id = $${idx}`,
        vals
      );
    }
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.delete('/balances/:id', auth, async (req, res, next) => {
  try {
    const r = await execute(
      'DELETE FROM account_balances WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.userId]
    );
    if (!r.rowCount) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
