const { queryOne, pool } = require('../db/database');

const SOURCES = ['Salary', 'Business', 'Freelance', 'Investment', 'Rental', 'Gift', 'Other'];

// Shared insert path for incomes (POST /income and confirming a pending SMS
// transaction). Entries without an amount or date are skipped, as before.
async function createIncomes(userId, incomes) {
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
          userId, parseFloat(inc.amount),
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
  return Promise.all(ids.map(id => queryOne('SELECT * FROM incomes WHERE id = $1', [id])));
}

module.exports = { createIncomes, SOURCES };
