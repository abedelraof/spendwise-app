const { query } = require('../db/database');

const GOAL_SQL = `
  SELECT g.*,
    a.name AS account_name, a.currency AS account_currency,
    ab.balance AS latest_balance
  FROM savings_goals g
  LEFT JOIN accounts a ON a.id = g.account_id
  LEFT JOIN account_balances ab ON ab.id = (
    SELECT id FROM account_balances
    WHERE account_id = g.account_id
    ORDER BY recorded_date DESC, created_at DESC LIMIT 1
  )
  WHERE g.user_id = $1
  ORDER BY g.created_at
`;

const findByUser = (userId) => query(GOAL_SQL, [userId]);

module.exports = { findByUser };
