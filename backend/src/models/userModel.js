const { query, queryOne, execute } = require('../db/database');

const findByEmail = (email) =>
  queryOne('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email]);

const findById = (id) =>
  queryOne(
    'SELECT id, email, currency, accounts_currency, theme, claude_api_key, pin_hash, is_admin, created_at FROM users WHERE id = $1',
    [id]
  );

const createUser = async ({ email, passwordHash, currency = 'EGP' }) => {
  const row = await queryOne(
    'INSERT INTO users (email, password_hash, currency) VALUES ($1, $2, $3) RETURNING id',
    [email.toLowerCase(), passwordHash, currency]
  );
  return { lastInsertRowid: row.id };
};

const updateSettings = async (userId, { currency, claudeApiKey, theme, accountsCurrency, pinHash }) => {
  const fields = []; const vals = []; let idx = 1;
  if (currency         !== undefined) { fields.push(`currency = $${idx++}`);          vals.push(currency); }
  if (claudeApiKey     !== undefined) { fields.push(`claude_api_key = $${idx++}`);    vals.push(claudeApiKey); }
  if (theme            !== undefined) { fields.push(`theme = $${idx++}`);             vals.push(theme); }
  if (accountsCurrency !== undefined) { fields.push(`accounts_currency = $${idx++}`); vals.push(accountsCurrency); }
  if (pinHash          !== undefined) { fields.push(`pin_hash = $${idx++}`);          vals.push(pinHash); }
  if (!fields.length) return;
  vals.push(userId);
  await execute(`UPDATE users SET ${fields.join(', ')} WHERE id = $${idx}`, vals);
};

module.exports = { findByEmail, findById, createUser, updateSettings };
