const router = require('express').Router();
const auth   = require('../middleware/auth');
const db     = require('../db/database');

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
  WHERE a.user_id = ?
  ORDER BY a.created_at
`;

const list = (userId) => db.prepare(LIST_SQL).all(userId);

// GET all accounts (with latest balance)
router.get('/', auth, (req, res) => {
  res.json({ accounts: list(req.user.userId) });
});

// POST create account
router.post('/', auth, (req, res, next) => {
  try {
    const { name, currency = 'EGP', icon = '🏦', type = 'monetary', unit = null } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    db.prepare(
      'INSERT INTO accounts (user_id, name, currency, icon, type, unit) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(req.user.userId, name.trim(), currency, icon, type, unit);
    res.status(201).json({ accounts: list(req.user.userId) });
  } catch (err) { next(err); }
});

// PUT update account
router.put('/:id', auth, (req, res, next) => {
  try {
    const { name, currency, icon, type, unit } = req.body;
    const fields = []; const vals = [];
    if (name     !== undefined) { fields.push('name = ?');     vals.push(name.trim()); }
    if (currency !== undefined) { fields.push('currency = ?'); vals.push(currency); }
    if (icon     !== undefined) { fields.push('icon = ?');     vals.push(icon); }
    if (type     !== undefined) { fields.push('type = ?');     vals.push(type); }
    if (unit     !== undefined) { fields.push('unit = ?');     vals.push(unit); }
    if (fields.length) {
      vals.push(req.params.id, req.user.userId);
      db.prepare(`UPDATE accounts SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`).run(...vals);
    }
    res.json({ accounts: list(req.user.userId) });
  } catch (err) { next(err); }
});

// DELETE account
router.delete('/:id', auth, (req, res) => {
  db.prepare('DELETE FROM accounts WHERE id = ? AND user_id = ?').run(req.params.id, req.user.userId);
  res.json({ success: true });
});

// GET balance history for one account
router.get('/:id/history', auth, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 30, 100);
  const rows = db.prepare(
    'SELECT * FROM account_balances WHERE account_id = ? AND user_id = ? ORDER BY recorded_date DESC, created_at DESC LIMIT ?'
  ).all(req.params.id, req.user.userId, limit);
  res.json({ history: rows });
});

// POST record balances (bulk snapshot)
router.post('/balances', auth, (req, res, next) => {
  try {
    const { entries, recordedDate, notes } = req.body;
    if (!Array.isArray(entries) || !entries.length || !recordedDate) {
      return res.status(400).json({ error: 'entries array and recordedDate are required' });
    }
    const stmt = db.prepare(
      'INSERT INTO account_balances (account_id, user_id, balance, recorded_date, notes, quantity, price_per_unit, exchange_rate) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    const insertAll = db.transaction(() => {
      for (const e of entries) {
        if (!e.accountId) continue;
        const rate = typeof e.exchangeRate === 'number' ? e.exchangeRate : 1.0;
        if (e.quantity !== undefined && e.pricePerUnit !== undefined &&
            e.quantity !== '' && e.pricePerUnit !== '') {
          const qty = parseFloat(e.quantity);
          const ppu = parseFloat(e.pricePerUnit);
          stmt.run(e.accountId, req.user.userId, qty * ppu, recordedDate, notes ?? null, qty, ppu, rate);
        } else if (e.balance !== undefined && e.balance !== '') {
          stmt.run(e.accountId, req.user.userId, parseFloat(e.balance), recordedDate, notes ?? null, null, null, rate);
        }
      }
    });
    insertAll();
    res.status(201).json({ accounts: list(req.user.userId) });
  } catch (err) { next(err); }
});

// PUT update a balance snapshot
router.put('/balances/:id', auth, (req, res, next) => {
  try {
    const { balance, quantity, price_per_unit, recorded_date, notes, exchange_rate } = req.body;
    const row = db.prepare('SELECT * FROM account_balances WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.userId);
    if (!row) return res.status(404).json({ error: 'Not found' });

    const fields = []; const vals = [];
    if (recorded_date !== undefined) { fields.push('recorded_date = ?'); vals.push(recorded_date); }
    if (notes          !== undefined) { fields.push('notes = ?');         vals.push(notes ?? null); }
    if (exchange_rate  !== undefined) { fields.push('exchange_rate = ?'); vals.push(exchange_rate); }
    if (quantity != null && price_per_unit != null) {
      const qty = parseFloat(quantity), ppu = parseFloat(price_per_unit);
      fields.push('quantity = ?', 'price_per_unit = ?', 'balance = ?');
      vals.push(qty, ppu, qty * ppu);
    } else if (balance != null) {
      fields.push('balance = ?', 'quantity = ?', 'price_per_unit = ?');
      vals.push(parseFloat(balance), null, null);
    }
    if (fields.length) {
      vals.push(req.params.id, req.user.userId);
      db.prepare(`UPDATE account_balances SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`).run(...vals);
    }
    res.json({ success: true });
  } catch (err) { next(err); }
});

// DELETE a balance snapshot
router.delete('/balances/:id', auth, (req, res) => {
  const r = db.prepare('DELETE FROM account_balances WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.user.userId);
  if (!r.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true });
});

module.exports = router;
