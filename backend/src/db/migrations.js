const { pool } = require('./database');

async function runMigrations() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id               SERIAL PRIMARY KEY,
        email            TEXT NOT NULL UNIQUE,
        password_hash    TEXT NOT NULL,
        currency         TEXT NOT NULL DEFAULT 'EGP',
        accounts_currency TEXT DEFAULT NULL,
        claude_api_key   TEXT DEFAULT NULL,
        theme            TEXT NOT NULL DEFAULT 'light',
        pin_hash         TEXT DEFAULT NULL,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS categories (
        id         SERIAL PRIMARY KEY,
        user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name       TEXT NOT NULL,
        icon       TEXT DEFAULT NULL,
        color      TEXT DEFAULT NULL,
        is_default INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(user_id, name)
      );

      CREATE TABLE IF NOT EXISTS subcategories (
        id          SERIAL PRIMARY KEY,
        category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
        user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name        TEXT NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(category_id, name)
      );

      CREATE TABLE IF NOT EXISTS expenses (
        id             SERIAL PRIMARY KEY,
        user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        amount         NUMERIC NOT NULL CHECK(amount > 0),
        currency       TEXT NOT NULL DEFAULT 'EGP',
        exchange_rate  NUMERIC NOT NULL DEFAULT 1.0,
        date           TEXT NOT NULL,
        category_id    INTEGER REFERENCES categories(id) ON DELETE SET NULL,
        subcategory_id INTEGER REFERENCES subcategories(id) ON DELETE SET NULL,
        description    TEXT DEFAULT NULL,
        notes          TEXT DEFAULT NULL,
        tags           TEXT DEFAULT NULL,
        raw_text       TEXT DEFAULT NULL,
        is_recurring   INTEGER NOT NULL DEFAULT 0,
        recurring_id   INTEGER DEFAULT NULL,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS budgets (
        id          SERIAL PRIMARY KEY,
        user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
        amount      NUMERIC NOT NULL CHECK(amount > 0),
        period      TEXT NOT NULL DEFAULT 'monthly',
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(user_id, category_id, period)
      );

      CREATE TABLE IF NOT EXISTS recurring_expenses (
        id             SERIAL PRIMARY KEY,
        user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        amount         NUMERIC NOT NULL CHECK(amount > 0),
        currency       TEXT NOT NULL DEFAULT 'EGP',
        exchange_rate  NUMERIC NOT NULL DEFAULT 1.0,
        category_id    INTEGER REFERENCES categories(id) ON DELETE SET NULL,
        subcategory_id INTEGER REFERENCES subcategories(id) ON DELETE SET NULL,
        description    TEXT DEFAULT NULL,
        tags           TEXT DEFAULT NULL,
        interval_type  TEXT NOT NULL DEFAULT 'monthly',
        next_due_date  TEXT NOT NULL,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS monthly_insights (
        id         SERIAL PRIMARY KEY,
        user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        year_month TEXT NOT NULL,
        insight    TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(user_id, year_month)
      );

      CREATE TABLE IF NOT EXISTS accounts (
        id          SERIAL PRIMARY KEY,
        user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name        TEXT NOT NULL,
        currency    TEXT NOT NULL DEFAULT 'EGP',
        icon        TEXT NOT NULL DEFAULT '🏦',
        type        TEXT NOT NULL DEFAULT 'monetary',
        unit        TEXT DEFAULT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(user_id, name)
      );

      CREATE TABLE IF NOT EXISTS account_balances (
        id             SERIAL PRIMARY KEY,
        account_id     INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        balance        NUMERIC NOT NULL,
        quantity       NUMERIC DEFAULT NULL,
        price_per_unit NUMERIC DEFAULT NULL,
        exchange_rate  NUMERIC NOT NULL DEFAULT 1.0,
        recorded_date  TEXT NOT NULL,
        notes          TEXT DEFAULT NULL,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS savings_goals (
        id              SERIAL PRIMARY KEY,
        user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        account_id      INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
        name            TEXT NOT NULL,
        icon            TEXT NOT NULL DEFAULT '🎯',
        target_amount   NUMERIC NOT NULL CHECK(target_amount > 0),
        target_currency TEXT NOT NULL DEFAULT 'EGP',
        current_amount  NUMERIC NOT NULL DEFAULT 0,
        target_date     TEXT DEFAULT NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS account_groups (
        id         SERIAL PRIMARY KEY,
        user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name       TEXT NOT NULL,
        icon       TEXT NOT NULL DEFAULT '📁',
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(user_id, name)
      );

      CREATE INDEX IF NOT EXISTS idx_account_groups_user ON account_groups(user_id);

      CREATE TABLE IF NOT EXISTS incomes (
        id            SERIAL PRIMARY KEY,
        user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        amount        NUMERIC NOT NULL CHECK(amount > 0),
        currency      TEXT NOT NULL DEFAULT 'EGP',
        exchange_rate NUMERIC NOT NULL DEFAULT 1.0,
        date          TEXT NOT NULL,
        source        TEXT NOT NULL DEFAULT 'Other',
        description   TEXT DEFAULT NULL,
        notes         TEXT DEFAULT NULL,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_expenses_user_date     ON expenses(user_id, date);
      CREATE INDEX IF NOT EXISTS idx_expenses_user_category ON expenses(user_id, category_id);
      CREATE INDEX IF NOT EXISTS idx_subcategories_category ON subcategories(category_id);
      CREATE INDEX IF NOT EXISTS idx_budgets_user           ON budgets(user_id);
      CREATE INDEX IF NOT EXISTS idx_recurring_user_due     ON recurring_expenses(user_id, next_due_date);
      CREATE INDEX IF NOT EXISTS idx_accounts_user          ON accounts(user_id);
      CREATE INDEX IF NOT EXISTS idx_account_balances_acct  ON account_balances(account_id, recorded_date);
      CREATE INDEX IF NOT EXISTS idx_savings_goals_user     ON savings_goals(user_id);
      CREATE INDEX IF NOT EXISTS idx_incomes_user_date      ON incomes(user_id, date);
    `);

    // Additive column migrations (safe to run every startup)
    await client.query(`
      ALTER TABLE accounts ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE accounts ADD COLUMN IF NOT EXISTS group_id   INTEGER REFERENCES account_groups(id) ON DELETE SET NULL;
      ALTER TABLE users    ADD COLUMN IF NOT EXISTS is_admin   INTEGER NOT NULL DEFAULT 0;

      ALTER TABLE users ADD COLUMN IF NOT EXISTS plan                TEXT        NOT NULL DEFAULT 'free';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_used_this_month  INTEGER     NOT NULL DEFAULT 0;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_quota_reset_date TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS play_purchase_token TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_expiry TIMESTAMPTZ;
    `);

    await client.query(`
      ALTER TABLE telegram_links ADD COLUMN IF NOT EXISTS last_expense_ids INTEGER[];
      ALTER TABLE telegram_links ADD COLUMN IF NOT EXISTS digest_frequency TEXT NOT NULL DEFAULT 'off';
    `);

    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS monthly_budget_cap NUMERIC;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_parse_cache (
        id           SERIAL PRIMARY KEY,
        cache_key    TEXT        NOT NULL UNIQUE,
        response_json TEXT       NOT NULL,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_ai_cache_key ON ai_parse_cache(cache_key);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS telegram_links (
        id        SERIAL PRIMARY KEY,
        user_id   INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        chat_id   BIGINT NOT NULL UNIQUE,
        linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS telegram_link_codes (
        id         SERIAL PRIMARY KEY,
        user_id    INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        code       TEXT NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS telegram_sessions (
        chat_id          BIGINT PRIMARY KEY REFERENCES telegram_links(chat_id) ON DELETE CASCADE,
        pending_expenses JSONB NOT NULL,
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    console.log('[migrations] Schema up to date');
  } finally {
    client.release();
  }
}

module.exports = runMigrations;
