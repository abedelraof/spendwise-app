const db = require('../db/database');

const findByEmail = (email) =>
  db.prepare('SELECT * FROM users WHERE email = ?').get(email);

const findById = (id) =>
  db.prepare('SELECT id, email, currency, accounts_currency, theme, claude_api_key, pin_hash, created_at FROM users WHERE id = ?').get(id);

const createUser = ({ email, passwordHash, currency = 'EGP' }) =>
  db.prepare('INSERT INTO users (email, password_hash, currency) VALUES (?, ?, ?)').run(email, passwordHash, currency);

const updateSettings = (userId, { currency, claudeApiKey, theme, accountsCurrency, pinHash }) => {
  const fields = []; const vals = [];
  if (currency         !== undefined) { fields.push('currency = ?');          vals.push(currency); }
  if (claudeApiKey     !== undefined) { fields.push('claude_api_key = ?');    vals.push(claudeApiKey); }
  if (theme            !== undefined) { fields.push('theme = ?');             vals.push(theme); }
  if (accountsCurrency !== undefined) { fields.push('accounts_currency = ?'); vals.push(accountsCurrency); }
  if (pinHash          !== undefined) { fields.push('pin_hash = ?');          vals.push(pinHash); }
  if (!fields.length) return;
  vals.push(userId);
  db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
};

module.exports = { findByEmail, findById, createUser, updateSettings };
