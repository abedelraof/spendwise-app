const db = require('./database');

function runMigrations() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      email          TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash  TEXT NOT NULL,
      currency       TEXT NOT NULL DEFAULT 'EGP',
      claude_api_key TEXT DEFAULT NULL,
      theme          TEXT NOT NULL DEFAULT 'light',
      created_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS categories (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name       TEXT NOT NULL,
      icon       TEXT DEFAULT NULL,
      color      TEXT DEFAULT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, name)
    );

    CREATE TABLE IF NOT EXISTS subcategories (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(category_id, name)
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount         REAL NOT NULL CHECK(amount > 0),
      currency       TEXT NOT NULL DEFAULT 'EGP',
      exchange_rate  REAL NOT NULL DEFAULT 1.0,
      date           TEXT NOT NULL,
      category_id    INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      subcategory_id INTEGER REFERENCES subcategories(id) ON DELETE SET NULL,
      description    TEXT DEFAULT NULL,
      notes          TEXT DEFAULT NULL,
      tags           TEXT DEFAULT NULL,
      raw_text       TEXT DEFAULT NULL,
      is_recurring   INTEGER NOT NULL DEFAULT 0,
      recurring_id   INTEGER DEFAULT NULL,
      created_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS budgets (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      amount      REAL NOT NULL CHECK(amount > 0),
      period      TEXT NOT NULL DEFAULT 'monthly',
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, category_id, period)
    );

    CREATE TABLE IF NOT EXISTS recurring_expenses (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount         REAL NOT NULL CHECK(amount > 0),
      currency       TEXT NOT NULL DEFAULT 'EGP',
      exchange_rate  REAL NOT NULL DEFAULT 1.0,
      category_id    INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      subcategory_id INTEGER REFERENCES subcategories(id) ON DELETE SET NULL,
      description    TEXT DEFAULT NULL,
      tags           TEXT DEFAULT NULL,
      interval_type  TEXT NOT NULL DEFAULT 'monthly',
      next_due_date  TEXT NOT NULL,
      created_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS monthly_insights (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      year_month TEXT NOT NULL,
      insight    TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, year_month)
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      currency    TEXT NOT NULL DEFAULT 'EGP',
      icon        TEXT NOT NULL DEFAULT '🏦',
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, name)
    );

    CREATE TABLE IF NOT EXISTS account_balances (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id    INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      balance       REAL NOT NULL,
      recorded_date TEXT NOT NULL,
      notes         TEXT DEFAULT NULL,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_expenses_user_date     ON expenses(user_id, date);
    CREATE INDEX IF NOT EXISTS idx_expenses_user_category ON expenses(user_id, category_id);
    CREATE INDEX IF NOT EXISTS idx_subcategories_category ON subcategories(category_id);
    CREATE INDEX IF NOT EXISTS idx_budgets_user           ON budgets(user_id);
    CREATE INDEX IF NOT EXISTS idx_recurring_user_due     ON recurring_expenses(user_id, next_due_date);
    CREATE INDEX IF NOT EXISTS idx_accounts_user          ON accounts(user_id);
    CREATE INDEX IF NOT EXISTS idx_account_balances_acct  ON account_balances(account_id, recorded_date);

    CREATE TABLE IF NOT EXISTS savings_goals (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      account_id      INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
      name            TEXT NOT NULL,
      icon            TEXT NOT NULL DEFAULT '🎯',
      target_amount   REAL NOT NULL CHECK(target_amount > 0),
      target_currency TEXT NOT NULL DEFAULT 'EGP',
      current_amount  REAL NOT NULL DEFAULT 0,
      target_date     TEXT DEFAULT NULL,
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_savings_goals_user ON savings_goals(user_id);

    CREATE TABLE IF NOT EXISTS incomes (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount        REAL NOT NULL CHECK(amount > 0),
      currency      TEXT NOT NULL DEFAULT 'EGP',
      exchange_rate REAL NOT NULL DEFAULT 1.0,
      date          TEXT NOT NULL,
      source        TEXT NOT NULL DEFAULT 'Other',
      description   TEXT DEFAULT NULL,
      notes         TEXT DEFAULT NULL,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_incomes_user_date ON incomes(user_id, date);
  `);

  // Commodity accounts — add columns if they don't exist yet
  const alter = (sql) => { try { db.exec(sql); } catch (_) {} };
  alter(`ALTER TABLE accounts ADD COLUMN type TEXT NOT NULL DEFAULT 'monetary'`);
  alter(`ALTER TABLE accounts ADD COLUMN unit TEXT DEFAULT NULL`);
  alter(`ALTER TABLE account_balances ADD COLUMN quantity REAL DEFAULT NULL`);
  alter(`ALTER TABLE account_balances ADD COLUMN price_per_unit REAL DEFAULT NULL`);
  alter(`ALTER TABLE users ADD COLUMN accounts_currency TEXT DEFAULT NULL`);
  alter(`ALTER TABLE account_balances ADD COLUMN exchange_rate REAL NOT NULL DEFAULT 1.0`);
  alter(`ALTER TABLE users ADD COLUMN pin_hash TEXT DEFAULT NULL`);
}

module.exports = runMigrations;
