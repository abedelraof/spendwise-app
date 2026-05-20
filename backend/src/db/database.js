const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost')
    ? { rejectUnauthorized: false }
    : false,
});

pool.on('error', (err) => console.error('[pg] Unexpected pool error', err));

/** Run a query, return all rows */
const query    = (sql, params = []) => pool.query(sql, params).then(r => r.rows);
/** Run a query, return first row or null */
const queryOne = (sql, params = []) => pool.query(sql, params).then(r => r.rows[0] ?? null);
/** Run a query, return the full pg Result (for rowCount / RETURNING) */
const execute  = (sql, params = []) => pool.query(sql, params);

module.exports = { pool, query, queryOne, execute };
