const db = require('../db/database');
const { todayISO, addInterval } = require('../utils/dateUtils');

function processOverdue() {
  const today = todayISO();
  const overdue = db.prepare(`
    SELECT * FROM recurring_expenses WHERE next_due_date <= ?
  `).all(today);

  const insertExpense = db.prepare(`
    INSERT INTO expenses (user_id, amount, currency, exchange_rate, date, category_id, subcategory_id,
      description, tags, is_recurring, recurring_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
  `);
  const advanceDue = db.prepare(`
    UPDATE recurring_expenses SET next_due_date = ? WHERE id = ?
  `);

  const process = db.transaction(() => {
    for (const r of overdue) {
      insertExpense.run(
        r.user_id, r.amount, r.currency, r.exchange_rate,
        r.next_due_date, r.category_id, r.subcategory_id,
        r.description, r.tags, r.id
      );
      advanceDue.run(addInterval(r.next_due_date, r.interval_type), r.id);
    }
  });
  process();
  return overdue.length;
}

module.exports = { processOverdue };
