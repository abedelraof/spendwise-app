const { query, execute, pool } = require('../db/database');
const { todayISO, addInterval } = require('../utils/dateUtils');

async function processOverdue() {
  const today = todayISO();
  const overdue = await query(
    'SELECT * FROM recurring_expenses WHERE next_due_date <= $1',
    [today]
  );
  if (!overdue.length) return 0;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const r of overdue) {
      await client.query(
        `INSERT INTO expenses
           (user_id, amount, currency, exchange_rate, date, category_id, subcategory_id,
            description, tags, is_recurring, recurring_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,1,$10)`,
        [r.user_id, r.amount, r.currency, r.exchange_rate,
         r.next_due_date, r.category_id, r.subcategory_id,
         r.description, r.tags, r.id]
      );
      await client.query(
        'UPDATE recurring_expenses SET next_due_date = $1 WHERE id = $2',
        [addInterval(r.next_due_date, r.interval_type), r.id]
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  return overdue.length;
}

module.exports = { processOverdue };
