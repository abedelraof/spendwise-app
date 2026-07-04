# ExpenseBeam (formerly "SpendWise") — Project Documentation

## What Is This

ExpenseBeam is a personal finance tracker with a React web app, a Flutter mobile app, a Telegram bot, and a marketing landing page, sharing one Express/PostgreSQL backend. It tracks expenses, income, budgets, recurring bills, multi-currency bank accounts, savings goals, and produces reports. It includes Claude AI integration for parsing natural-language expense descriptions, a "Finance Chat" Q&A assistant, and monthly AI-generated insights. It runs as a freemium product (Google Play billing) with an admin dashboard for operators.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Web frontend | React 19 + Vite, Tailwind CSS, Recharts, Lucide icons |
| Mobile app | Flutter (`expensebeam_mobile/`) — Dio, Provider, fl_chart, flutter_secure_storage |
| Backend | Node.js + Express 5, **PostgreSQL** via `pg` (raw SQL, no ORM) |
| Auth | JWT (jsonwebtoken) + bcryptjs password hashing |
| AI | Anthropic Claude SDK (`@anthropic-ai/sdk`), server-side API key (no per-user keys) |
| Bot | Telegram bot via `telegraf` — chat-based expense entry, stats, digests (see "Telegram Bot" section) |
| Billing | Google Play Developer API subscription verification (freemium AI quota) |
| Scheduler | node-cron — recurring expenses, monthly AI quota reset, subscription expiry check, Telegram digests/insight push |
| Exchange rates | open.er-api.com (1-hour cached proxy) |
| Encryption | AES-256-GCM via Node crypto (`cryptoService.js`, currently unused by any active per-user secret) |
| Deployment | Docker Compose (Postgres + Node backend + Caddy-served frontend), auto-SSL |

**Ports:** Backend `3001`, Frontend (Vite dev) `5173`

**Start commands:**
```
backend:  cd D:\FlutterApp\backend  && npm run dev   (nodemon)
frontend: cd D:\FlutterApp\frontend && npm run dev   (vite)
mobile:   cd D:\FlutterApp\expensebeam_mobile && flutter run
```

**Required env vars** (`backend/.env`):
```
PORT=3001
JWT_SECRET=<32+ char secret>
DATABASE_URL=postgresql://postgres:root@localhost:5432/spendwise   (local dev)
ANTHROPIC_API_KEY=<server-side Claude key>
# Optional, only needed for Google Play subscription verification:
GOOGLE_SERVICE_ACCOUNT_JSON=<service account JSON, single line>
GOOGLE_PLAY_PACKAGE=com.expensebeam.expensebeam_mobile
GOOGLE_PLAY_SUBSCRIPTION_ID=expensebeam_pro_monthly
# Optional, only needed for the Telegram bot (leave blank to disable it entirely):
TELEGRAM_BOT_TOKEN=<token from @BotFather>
TELEGRAM_BOT_USERNAME=<bot username, e.g. expensebeam_bot>
TELEGRAM_WEBHOOK_SECRET=<random string, used as a secret path segment>
TELEGRAM_MODE=polling   # optional, local-dev only — omit/anything else means "webhook" (needs a public HTTPS DOMAIN)
```

Production uses Docker Compose with `DOMAIN` and `DB_PASSWORD` — see the "Deployment" section below.

---

## Directory Layout

```
D:\FlutterApp\
├── backend/
│   └── src/
│       ├── app.js              ← Express app, all route mounts
│       ├── server.js           ← HTTP listen, migrations, cron setup (recurring, AI quota reset, sub expiry)
│       ├── db/
│       │   ├── database.js     ← pg Pool singleton; query()/queryOne()/execute() helpers
│       │   └── migrations.js   ← CREATE TABLE IF NOT EXISTS + additive ALTER TABLE (runs on startup)
│       ├── middleware/
│       │   ├── auth.js         ← JWT verification → req.user.userId
│       │   ├── adminAuth.js    ← requires users.is_admin = 1 (chained after auth)
│       │   └── errorHandler.js
│       ├── models/
│       │   ├── userModel.js
│       │   ├── categoryModel.js
│       │   ├── subcategoryModel.js
│       │   ├── expenseModel.js
│       │   └── goalModel.js          ← findByUser() — goal + linked account + latest balance join
│       ├── routes/
│       │   ├── auth.js         ← POST /login, POST /signup (response includes is_admin)
│       │   ├── settings.js     ← GET/PUT /settings, POST /settings/clear-data ("Danger Zone")
│       │   ├── categories.js   ← CRUD /categories + subcategories
│       │   ├── expenses.js     ← CRUD /expenses
│       │   ├── budgets.js      ← CRUD /budgets
│       │   ├── recurring.js    ← CRUD /recurring
│       │   ├── accounts.js     ← CRUD /accounts + reorder + balance snapshots
│       │   ├── accountGroups.js← CRUD /account-groups + reorder (user-defined Accounts page groupings)
│       │   ├── income.js       ← CRUD /income (filterable list)
│       │   ├── goals.js        ← CRUD /goals (savings goals)
│       │   ├── reports.js      ← GET /reports/* (trend, breakdown, topDays, export)
│       │   ├── ai.js           ← POST /ai/parse, POST /ai/ask (both quota-gated + cached)
│       │   ├── insights.js     ← GET /insights/monthly — thin wrapper over insightService.generateMonthlyInsight
│       │   ├── subscription.js ← GET /subscription, POST /subscription/verify (Google Play)
│       │   ├── admin.js        ← GET /admin/stats, /admin/users, /admin/users/:id (adminAuth-gated)
│       │   ├── seed.js         ← POST /seed — generates demo data for a fresh account
│       │   ├── rates.js        ← GET /rates?base=X — thin wrapper over ratesService.getRates
│       │   ├── search.js       ← GET /search?q=
│       │   ├── import.js       ← POST /import/csv
│       │   └── telegramLink.js ← GET/POST/DELETE /telegram-link — web-side linking-code flow for the bot
│       ├── services/
│       │   ├── aiService.js          ← Claude calls: parseExpenses(), reviseExpenses(), answerQuestion() (Finance Chat), generateInsight()
│       │   ├── expenseService.js     ← getDashboardStats, getRangeStats (arbitrary date range), getFinanceContext, createExpenses (shared insert path)
│       │   ├── insightService.js     ← generateMonthlyInsight() — extracted from routes/insights.js, uses server-side ANTHROPIC_API_KEY
│       │   ├── accountService.js     ← getAccountsWithBalances(), getNetWorth() (shared by routes/accounts.js and the bot's /networth)
│       │   ├── ratesService.js       ← getRates() — in-memory 1h cache + open.er-api.com fetch, shared by routes/rates.js and the bot
│       │   ├── categoryService.js    ← find-or-create category by name
│       │   ├── budgetService.js      ← budget limit checks
│       │   ├── recurringService.js   ← processOverdue() → inserts expenses + advances dates
│       │   ├── telegramBotService.js ← Telegraf bot: linking, expense parse/revise/confirm, all bot commands, proactive sends (see "Telegram Bot" section)
│       │   └── cryptoService.js      ← encrypt()/decrypt() AES-256-GCM (legacy; not wired to any route now)
│       └── utils/
│           ├── dateUtils.js    ← todayISO(), yesterdayISO(), addInterval(), getMonthRange()
│           └── csvExport.js    ← expenses → CSV string
├── frontend/
│   └── src/
│       ├── App.jsx             ← Router: "/" PublicHome, "/app/login", "/app/signup", "/app/*" ProtectedRoute
│       ├── index.css           ← Tailwind + .card/.btn/.input/.label component classes
│       ├── context/
│       │   └── AuthContext.jsx ← token, user, login/logout/updateUser, applyTheme()
│       ├── hooks/
│       │   ├── useAuth.js
│       │   └── useApi.js       ← axios instance with Authorization header
│       ├── api/                ← thin wrappers: each file = one backend route group
│       │   ├── authApi.js, expensesApi.js, categoriesApi.js, budgetsApi.js, recurringApi.js,
│       │   ├── reportsApi.js, accountsApi.js (+ account groups), incomeApi.js, goalsApi.js,
│       │   ├── aiApi.js (parse + askQuestion), settingsApi.js, adminApi.js, seedApi.js, telegramApi.js
│       ├── pages/
│       │   ├── Dashboard.jsx        ← Stats, AI input, Finance Chat, latest transactions, budget alerts, upcoming bills
│       │   ├── Transactions.jsx     ← Tabs: Expenses table (filterable, paginated) + Recurring (moved here, no longer its own nav item)
│       │   ├── Reports.jsx          ← Charts: daily, weekly, category pie + summary, trend
│       │   ├── Recurring.jsx        ← Legacy standalone recurring UI; superseded by the Transactions tab (see gotcha #10)
│       │   ├── Accounts.jsx         ← Multi-account (with groups), balance snapshots, net worth
│       │   ├── RecordBalances.jsx   ← `/app/accounts/record` — bulk balance-snapshot entry flow for all accounts at once
│       │   ├── Planning.jsx         ← Merges Budgets (BudgetManager) + Savings Goals into one screen
│       │   ├── Income.jsx           ← Income entries, filters, source badges
│       │   ├── Settings.jsx         ← Preferences, Telegram linking, categories, budgets, CSV import, Danger Zone (clear-data)
│       │   ├── Admin.jsx            ← Admin stats dashboard (visible only if user.is_admin === 1)
│       │   ├── AdminUsers.jsx       ← Admin: paginated user list
│       │   ├── AdminUserDetail.jsx  ← Admin: single user detail/drilldown
│       │   ├── Login.jsx
│       │   └── Signup.jsx
│       └── components/
│           ├── auth/            ProtectedRoute.jsx, PublicHome.jsx
│           ├── common/          Modal.jsx, Toast.jsx, Spinner.jsx, EmptyState.jsx, GlobalSearch.jsx (Ctrl+K), TagInput.jsx
│           ├── layout/           AppShell.jsx (desktop sidebar + mobile drawer), Sidebar.jsx (nav: Dashboard, Transactions,
│           │                     Reports, Accounts, Income, Planning, Settings, + conditional Admin link)
│           ├── dashboard/        StatsBar.jsx, StatCard.jsx, ExpenseInputPanel.jsx, ParsedExpenseConfirm.jsx,
│           │                     LatestTransactions.jsx, BudgetAlerts.jsx, MonthlyInsight.jsx, UpcomingBills.jsx,
│           │                     FinanceChat.jsx (natural-language Q&A over the user's finances, markdown+GFM tables)
│           └── settings/         CategoriesManager.jsx, BudgetManager.jsx, CsvImport.jsx, TelegramConnect.jsx (linking-code UI, polls GET /telegram-link)
├── expensebeam_mobile/          ← Flutter app mirroring most web screens, talks to the same backend API
│   └── lib/
│       ├── main.dart
│       ├── core/  api/api_client.dart (Dio), models/, providers/ (auth, theme), theme/, utils/formatters.dart
│       ├── screens/  auth/, dashboard/, transactions/, accounts/ (+ history, edit), income/, goals/, recurring/,
│       │             reports/, settings/ (+ categories), main_shell.dart
│       └── widgets/  expense_tile.dart, stat_card.dart
├── landing/                     ← Static marketing site (index.html + serve.cmd), separate from the React SPA
├── docker-compose.yml           ← db (postgres:16-alpine) + backend + frontend (Caddy, auto-SSL)
└── .worktrees/ui-variants       ← Active git worktree exploring visual styles for the expense-entry UI
```

---

## Database Schema

PostgreSQL. All tables created with `CREATE TABLE IF NOT EXISTS` in `migrations.js`; new columns added since launch use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, both run on every backend startup.

```sql
users (
  id, email, password_hash, currency, accounts_currency, theme,
  claude_api_key,           -- legacy column, unused (AI now uses server-side ANTHROPIC_API_KEY)
  pin_hash, is_admin,
  plan,                     -- 'free' | 'pro'
  ai_used_this_month, ai_quota_reset_date,
  play_purchase_token, subscription_expiry,
  created_at
)

categories (id, user_id, name, icon, color, is_default, created_at)
subcategories (id, category_id, user_id, name, created_at)

expenses (
  id, user_id, amount, currency, exchange_rate, date,
  category_id, subcategory_id, description, notes, tags, raw_text,
  is_recurring, recurring_id, created_at
)

budgets (id, user_id, category_id, amount, period, created_at)

recurring_expenses (
  id, user_id, amount, currency, exchange_rate,
  category_id, subcategory_id, description, tags,
  interval_type, next_due_date, created_at
)
-- INDEX: (user_id, next_due_date)

monthly_insights (id, user_id, year_month, insight, created_at)

accounts (
  id, user_id, name, type,         -- type: 'monetary' | 'commodity' | 'liability'
  currency, icon, unit, sort_order, group_id → account_groups, created_at
)

account_groups (id, user_id, name, icon, sort_order, created_at)
-- INDEX: (user_id)

account_balances (
  id, account_id, user_id,
  balance, quantity, price_per_unit,   -- commodity accounts use qty * ppu = balance
  exchange_rate, recorded_date, notes, created_at
)
-- INDEX: (account_id, recorded_date)

savings_goals (
  id, user_id, account_id,            -- account_id null = manual tracking
  name, icon, target_amount, target_currency, current_amount, target_date, created_at
)
-- INDEX: (user_id)

incomes (
  id, user_id, amount, currency, exchange_rate,
  date, source, description, notes, created_at
  -- source: Salary | Business | Freelance | Investment | Rental | Gift | Other
)
-- INDEX: (user_id, date)

ai_parse_cache (id, cache_key UNIQUE, response_json, created_at)
-- 24h SHA-256(userId:text) cache for /ai/parse and /ai/ask responses; cached hits don't count against quota
-- INDEX: (cache_key)

telegram_links (
  id, user_id UNIQUE, chat_id UNIQUE,
  last_expense_ids INTEGER[],    -- IDs from the most recent /confirm in that chat, for /undo (NULL after undo)
  digest_frequency,              -- 'off' | 'daily' | 'weekly', set via the /digest command
  linked_at
)

telegram_link_codes (id, user_id UNIQUE, code UNIQUE, expires_at, created_at)
-- one-time 6-digit code from Settings → Connect Telegram, 10-minute TTL, consumed by /start <code>

telegram_sessions (chat_id PRIMARY KEY → telegram_links, pending_expenses JSONB, updated_at)
-- current unconfirmed parsed expense list per chat, cleared on confirm/cancel
```

---

## Key Features & How They Work

### Authentication
- `POST /api/auth/login` / `/signup` → verifies/creates bcrypt hash → returns JWT + user (including `is_admin`)
- JWT signed with `JWT_SECRET`, decoded in `middleware/auth.js` → sets `req.user.userId`
- Frontend stores token in localStorage, attaches via `Authorization: Bearer` header in `useApi.js`

### Freemium AI + Subscriptions
- `users.plan` is `'free'` or `'pro'`. Free users get **403 `pro_required`** on any AI call; Pro users get **100 AI calls/month**, tracked in `ai_used_this_month`.
- `enforceAiQuota` middleware in `routes/ai.js` gates both `POST /ai/parse` and `POST /ai/ask` — checks plan, then quota, before calling Claude.
- Every AI request/response is cached 24h in `ai_parse_cache` keyed by `sha256(userId:inputText)`; a cache hit returns immediately and does **not** increment `ai_used_this_month`.
- `POST /api/subscription/verify` (mobile app, Google Play) takes `{ purchase_token, product_id, platform }`, calls the Google Play Developer API (`routes/subscription.js` builds its own OAuth JWT assertion from `GOOGLE_SERVICE_ACCOUNT_JSON`), rejects tokens already linked to another account, and on success sets `plan = 'pro'`, `subscription_expiry`, `play_purchase_token`.
- Cron in `server.js`: resets `ai_used_this_month` for all pro users on the 1st of each month (`0 0 1 * *`); downgrades expired pro users to free daily at 1 AM (`0 1 * * *`).

### Expense Parsing (AI)
- User types natural language in `ExpenseInputPanel` ("coffee 45 EGP, lunch 120")
- `POST /api/ai/parse` (quota-gated, cached) → `aiService.parseExpenses()` calls Claude with a structured prompt → returns parsed expense array
- User confirms in `ParsedExpenseConfirm` modal → bulk inserted via `POST /api/expenses`

### Finance Chat (AI Q&A)
- `FinanceChat.jsx` on the Dashboard lets the user ask free-form questions ("Am I on track with my budgets?")
- `POST /api/ai/ask` (quota-gated, cached) assembles context — recent expenses, category totals, incomes, budgets vs. spend, goals, accounts, dashboard stats — and calls `aiService.answerQuestion()`
- Response is markdown, rendered with `react-markdown` + `remark-gfm` (so tables render correctly)

### Monthly Insights (AI)
- `MonthlyInsight` component on Dashboard calls `GET /api/insights/monthly`
- `insightService.generateMonthlyInsight(userId, yearMonth)` checks if an insight for that month already exists in `monthly_insights`; if not, calls Claude (server-side key) with spending data, stores it, returns `{ insight, cached }`
- Also called directly by the Telegram monthly-insight-push cron (see below) — this is the single shared code path for both surfaces

### Exchange Rates
- `GET /api/rates?base=EGP` (or any currency)
- `routes/rates.js` fetches from `https://open.er-api.com/v6/latest/{base}`
- In-memory cache with 1-hour TTL (Map keyed by base currency)
- Conversion formula: `amount_in_home = amount / rates[currency]`
- Old balance records (exchange_rate=1.0 default) fall back to live rates as approximation; displayed with `~` prefix

### Recurring Expenses
- `recurringService.processOverdue()` queries `WHERE next_due_date <= today`
- Inserts each as a real expense (`is_recurring=1, recurring_id=X`) and advances `next_due_date` by interval
- Called once on startup (catches backlog) and then by node-cron daily at midnight (`0 0 * * *`)
- UI lives as a tab inside `Transactions.jsx` (see gotcha #10) — `Recurring.jsx` still exists as a standalone page component but is not linked from the sidebar

### Multi-Currency Accounts & Groups
- Each account has its own `currency`, optional `group_id` (→ `account_groups`, user-defined, drag-reorderable via `sort_order`)
- Balance snapshots store `exchange_rate` at time of entry (commodity: `quantity × price_per_unit = balance`)
- Net Worth = Σ(asset balances converted to home currency) − Σ(liability balances converted)
- `RecordBalances.jsx` (`/app/accounts/record`) provides a single flow to snapshot every account's balance at once, instead of editing accounts one at a time

### Savings Goals & Planning
- `Planning.jsx` combines `BudgetManager` (category budgets) and Goals management in one page — replaces a separate Budgets nav entry
- Goal linked to an account (`account_id` set) → progress = `account.latest_balance / target_amount`; unlinked → progress = `current_amount / target_amount`
- Days-left badge: amber < 30 days, red if overdue

### Admin Dashboard
- Gated by `users.is_admin = 1`; `middleware/adminAuth.js` enforces it server-side, `Sidebar.jsx` only renders the nav link client-side when `user.is_admin === 1`
- `GET /api/admin/stats` — total/new/active users, expense & income totals, account count, users with a (legacy) API key set, signups by month
- `GET /api/admin/users`, `GET /api/admin/users/:id`, `DELETE /api/admin/users/:id` — user list/detail/removal

### Telegram Bot
- Fully optional (no-op if `TELEGRAM_BOT_TOKEN` is unset): `telegramBotService.getBot()` returns `null`, `launch()` logs and returns early.
- **Linking**: web Settings → Telegram → "Connect Telegram" (`POST /api/telegram-link`) generates a 6-digit code (`telegram_link_codes`, 10-min TTL). User sends `/start <code>` to the bot (or taps the `t.me/<username>?start=<code>` deep link) → bot verifies the code, upserts `telegram_links` (one row per user, one per chat_id), deletes the code. `TelegramConnect.jsx` polls `GET /api/telegram-link` every few seconds to flip the UI to "Connected" automatically.
- **Expense entry**: any text message from a linked chat with no pending session → `aiService.parseExpenses()`; with a pending session (`telegram_sessions`) → `aiService.reviseExpenses()` (sends the pending list + the new message to Claude so it can apply corrections like "actually lunch was 150"). Either way the bot replies with the list (amount/date/category per line) and an inline `[✅ Confirm] [❌ Cancel]` keyboard. Confirm calls `expenseService.createExpenses()` — the same function `POST /api/expenses` uses — and stores the new expense IDs in `telegram_links.last_expense_ids`.
- **AI usage is unmetered for the bot**: unlike `/api/ai/parse`/`/ask` (gated by `enforceAiQuota`), all bot AI calls pass `null` for the API key (server-side `ANTHROPIC_API_KEY`) and skip quota/plan checks entirely — a deliberate product decision, not an oversight.
- **Pull commands** (all require a linked account): `/stats [today|yesterday|week|month]`, `/budgets`, `/recent`, `/goals`, `/networth`, `/currency <amount> <from> [to] <to>`, `/undo` (deletes the exact batch in `last_expense_ids`, then clears it — one-shot, not a general history undo), `/ask <question>` (same context-builder as Finance Chat, via `expenseService.getFinanceContext`), `/help`.
- **Proactive sends** (cron in `server.js`, all fixed UTC times — there is no per-user timezone anywhere in the app): daily digest 07:00 UTC (`sendDailyDigests`, `digest_frequency = 'daily'`, summarizes yesterday), weekly digest Sunday 20:00 UTC (`sendWeeklyDigests`, `digest_frequency = 'weekly'`, rolling last 7 days), monthly insight push 00:10 UTC on the 1st (`sendMonthlyInsights`, **every** linked user regardless of digest opt-in, calls `insightService.generateMonthlyInsight` for the month that just ended). Opt into digests with `/digest daily|weekly|off`; each proactive send loops per-user with its own try/catch so one failure (e.g. a user who blocked the bot) doesn't stop the batch.
- **Transport**: webhook in production (`bot.webhookCallback()` mounted in `app.js` *before* `express.json()` — Telegraf needs to own that route's body parsing — at `/api/telegram/webhook/<TELEGRAM_WEBHOOK_SECRET>`), registered via `setWebhook()` in `launch()`. Set `TELEGRAM_MODE=polling` for local dev (no public URL needed); production always uses the webhook.

### Demo Data Seeding
- `POST /api/seed` — one-shot demo data generator for a fresh account (8 categories/subcategories, 4 accounts with balance history, ~40 expenses, income, budgets, recurring bills, 2 savings goals). Refuses to run if the user already has expenses; `Settings.jsx` "Danger Zone" → `POST /api/settings/clear-data` wipes a user's data so seeding can be re-run.

### Themes
- `user.theme` values: `light` | `dark` | `system` | `high-contrast`
- Applied via `applyTheme()` in `AuthContext.jsx` → toggles `dark` and/or `high-contrast` class on `<html>`
- `system` mode listens to `window.matchMedia('(prefers-color-scheme: dark)')` for live OS changes
- `high-contrast` adds both `dark` + `high-contrast` classes → CSS overrides in `index.css`

---

## API Routes Reference

### Auth — `/api/auth`
| Method | Path | Description |
|--------|------|-------------|
| POST | `/login` | Email + password → JWT + user (incl. `is_admin`) |
| POST | `/signup` | Create account → JWT + user |

### Expenses — `/api/expenses`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List with filters: startDate, endDate, category, search, tags, sortBy, sortDir, limit, offset |
| POST | `/` | Bulk insert `{ expenses: [...] }` |
| PUT | `/:id` | Partial update |
| DELETE | `/:id` | Delete (ownership checked) |

### Income — `/api/income`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List with filters: startDate, endDate, source, search, limit, offset → `{ incomes, total }` |
| POST | `/` | Bulk insert `{ incomes: [...] }` |
| PUT | `/:id` | Partial update |
| DELETE | `/:id` | Delete |

### Accounts — `/api/accounts`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | All accounts with latest_balance joined |
| POST | `/` | Create account |
| PUT | `/reorder` | Bulk update `sort_order` |
| PUT | `/:id` | Update account |
| DELETE | `/:id` | Delete account |
| GET | `/:id/history` | All snapshots for account |
| POST | `/balances` | Add balance snapshot |
| PUT | `/balances/:id` | Edit snapshot |
| DELETE | `/balances/:id` | Delete snapshot |

### Account Groups — `/api/account-groups`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | All groups for user, ordered by sort_order |
| POST | `/` | Create group |
| PUT | `/:id` | Update group |
| DELETE | `/:id` | Delete group |
| PUT | `/reorder` | Bulk update sort_order |

### Goals — `/api/goals`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | All goals with account name + latest_balance joined |
| POST | `/` | Create goal |
| PUT | `/:id` | Partial update |
| DELETE | `/:id` | Delete |

### Reports — `/api/reports`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/dashboard-stats` | totalThisMonth, topCategory, dailyAverage, transactionCount, incomeThisMonth |
| GET | `/spending-trend` | Daily totals for date range → `{ data: [{date, total}] }` |
| GET | `/category-breakdown` | Per-category totals + percentages |
| GET | `/top-days` | Top N highest-spend days |
| GET | `/export-csv` | Download expenses as CSV blob |

### Rates — `/api/rates`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/?base=EGP` | Exchange rates (1h cached) |

### Settings — `/api/settings`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | currency, accounts_currency, theme |
| PUT | `/` | Update currency, theme, accounts_currency |
| POST | `/clear-data` | Danger Zone — wipes the user's expenses/income/accounts/etc. |

### AI — `/api/ai` (all quota-gated via `enforceAiQuota`, all 24h-cached)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/parse` | Natural language → expense array. 403 `pro_required` (free plan) / 429 `quota_exceeded` |
| POST | `/ask` | Finance Chat: free-form question + financial context → markdown answer |

### Insights — `/api/insights`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/monthly?yearMonth=YYYY-MM&force=true` | AI insight for the month (default: current), cached in `monthly_insights` unless `force` |
| DELETE | `/monthly/cache?yearMonth=YYYY-MM` | Clear the cached insight so it regenerates next call |

### Telegram Link — `/api/telegram-link` (web-side, used by Settings → Connect Telegram)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | `{ linked, linked_at }` for the current user |
| POST | `/` | Generate a 10-min linking code → `{ code, expires_at, deep_link }` |
| DELETE | `/` | Disconnect (removes the `telegram_links` row) |

### Subscription — `/api/subscription`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Current plan, ai_used, ai_limit, reset_date |
| POST | `/verify` | Verify a Google Play purchase token → upgrades to `pro` |

### Admin — `/api/admin` (requires `is_admin`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/stats` | Aggregate usage stats for the whole app |
| GET | `/users` | Paginated user list |
| GET | `/users/:id` | Single user detail |
| DELETE | `/users/:id` | Delete a user |

### Seed — `/api/seed`
| Method | Path | Description |
|--------|------|-------------|
| POST | `/` | Generate demo data for the current user (no-ops if they already have expenses) |

---

## Frontend Patterns

### Global CSS Classes (`index.css`)
- `.card` — white/slate-800 background, `rounded-xl`, shadow, border
- `.card-hover` — same + hover shadow transition
- `.btn-primary` — brand-600, `px-3 py-1.5`, rounded-lg
- `.btn-secondary` — white/slate-800, border, same padding
- `.btn-ghost` — transparent, hover bg
- `.btn-danger` — red-600
- `.input` — full-width, `rounded-lg`, focus ring brand-500
- `.label` — text-sm font-medium, mb-1.5

### State Management
- No Redux/Zustand — local `useState` per page, shared state via `AuthContext` only
- Each page fetches its own data via `useCallback` + `useEffect`
- Parallel fetches use `Promise.all` / `Promise.allSettled`

### Toast Notifications
- `showToast(message, type?)` — imported from `components/common/Toast`
- Types: default (success green), `'error'` (red), `'warning'` (amber)

### Pagination Pattern
- `PAGE_SIZE` constant per page (usually 20)
- `offset = page * PAGE_SIZE` sent to backend
- `totalPages = Math.ceil(total / PAGE_SIZE)` computed client-side
- Prev/Next buttons, disabled at boundaries

### Modal Pattern
- `<Modal open={bool} onClose={fn} title="..." size="sm|md|lg">`
- Form inside, cancel + submit buttons at bottom

---

## Deployment

Production runs via Docker Compose on a single host (`expensebeam.com`): a `postgres:16-alpine` container, a Node backend container, and a Caddy-based frontend container that serves the React build and reverse-proxies `/api/*` to the backend with automatic SSL. `docker-compose.yml` derives `DATABASE_URL` from `DB_PASSWORD` and passes through `ANTHROPIC_API_KEY`, `DOMAIN`, `TELEGRAM_BOT_TOKEN`/`TELEGRAM_BOT_USERNAME`/`TELEGRAM_WEBHOOK_SECRET`, and the Google Play vars from the server's `.env` (`/root/expensebeam/.env`, not tracked in git — ask if you need to inspect/edit it). DB migrations run automatically on backend startup (`IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`, safe to run every deploy). Most deploys touch only `backend/` — the usual cycle is `git push` → SSH in → `git pull && docker compose build backend && docker compose up -d backend`, then check `docker compose logs backend --tail=15` for `[telegram] Webhook registered` and no migration errors. Frontend changes additionally need `docker compose build frontend && docker compose up -d frontend`. Full SSH details are tracked outside this repo — ask if you need them.

---

## Things to Know / Gotchas

1. **Exchange rate fallback**: Records inserted before the exchange rate feature was added have `exchange_rate=1.0`. The Accounts page detects this (`exchange_rate === 1.0 && currency !== homeCurrency`) and uses live rates as approximation, shown with `~` prefix.

2. **Liability accounts**: `accounts.type = 'liability'` is valid with no schema change (no CHECK constraint). Net worth subtracts them. They appear in a separate "Liabilities" section on the Accounts page.

3. **Commodity accounts**: Use `quantity` × `price_per_unit` to compute `balance`. Gold, stocks, etc. Balance snapshots store all three fields.

4. **Savings goals progress**: If `account_id` is set, progress reads `latest_balance` from the joined account query. If null, reads `current_amount` from the goal itself.

5. **Recurring expenses**: `processOverdue()` handles multiple missed intervals in one call (it only fires once per call, so if 3 months are missed, it creates 1 expense and advances by 1 interval; the next startup/cron run creates the next one). Cron fires daily at midnight.

6. **incomeThisMonth in dashboard stats**: Added to `expenseService.getDashboardStats()` — queries the `incomes` table for the current calendar month and returns the total alongside expense stats.

7. **Theme system**: `applyTheme()` in AuthContext is a module-level function (not a hook) so it can be called from login, updateUser, and the useEffect without dependency issues.

8. **Reports page**: No longer has a Month-over-Month section (removed). `getMomComparison` still exists in expenseService (used by insights route) but the `/mom-comparison` HTTP route was deleted.

9. **CSV import**: Parses uploaded file via `csv-parse`, auto-matches categories via `categoryService.findOrCreate()`.

10. **Global search**: `Ctrl+K` dispatched from AppShell header button; `GlobalSearch.jsx` listens for the keyboard event and renders a search overlay.

11. **Recurring is a tab, not a page**: `Recurring.jsx` still exists as a component but is no longer linked from `Sidebar.jsx` — its functionality was moved into a tab inside `Transactions.jsx`. Don't add a sidebar entry back for it without checking whether the old page is still meant to be reachable.

12. **AI is server-funded and quota-gated, not BYO-key**: `users.claude_api_key` and `cryptoService.js` are legacy leftovers from an earlier per-user-key design. All Claude calls now use `ANTHROPIC_API_KEY` from the backend's own env, and are gated by `enforceAiQuota` in `routes/ai.js` (plan check + monthly counter) plus a 24h response cache in `ai_parse_cache`. When touching AI routes, remember cached hits must not increment `ai_used_this_month`.

13. **Backend is PostgreSQL, not SQLite**: `db/database.js` wraps a `pg` Pool with `query()/queryOne()/execute()` helpers — there is no `better-sqlite3` and no local `.db` file. Local dev needs a running Postgres instance and `DATABASE_URL` in `backend/.env`; schema changes go in `migrations.js` as idempotent `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` statements, not one-off migration scripts.

14. **Mobile app shares the backend, not the frontend code**: `expensebeam_mobile/` is an independent Flutter client (its own models/screens/state) that calls the same REST API as the React app. Feature parity between them is manual — a new backend endpoint or web page doesn't automatically show up on mobile.

15. **`landing/` is a separate static site**: not part of the React SPA build and not wired into `docker-compose.yml`/Caddy; treat it as a standalone marketing page.

16. **`.worktrees/ui-variants`**: an active git worktree (separate branch, separate checkout) experimenting with visual styles for the expense-entry flow. Changes there don't affect `master` until merged — don't assume edits under `.worktrees/` are live in the main app.

17. **Shared service extraction pattern**: whenever a piece of logic is needed by both an HTTP route and the Telegram bot, it gets pulled into a service/model function both call — `expenseService.createExpenses`/`getFinanceContext`/`getRangeStats`, `insightService.generateMonthlyInsight`, `accountService.getAccountsWithBalances`/`getNetWorth`, `ratesService.getRates`, `goalModel.findByUser`. Follow this pattern for new cross-surface features rather than duplicating a query inline in `telegramBotService.js`.

18. **The monthly-insight `claude_api_key` bug**: until it was fixed, `routes/insights.js` checked the legacy per-user `users.claude_api_key` field (see gotcha #12) and 402'd for every real user, since that field has been unused since the freemium migration. `insightService.generateMonthlyInsight` now correctly uses the server-side key like everything else. If you see other code still branching on `claude_api_key`/`hasApiKey`, treat it as dead and suspect, not intentional.

19. **Telegram bot AI calls bypass the freemium quota entirely**: a deliberate decision — `enforceAiQuota` in `routes/ai.js` only gates the `/api/ai/*` HTTP routes. `telegramBotService.js` never checks `plan` or `ai_used_this_month`; every linked user gets unlimited parsing/revision/`/ask`/monthly insights regardless of free/pro status. Don't "fix" this without checking — it's intentional, not an oversight (unlike gotcha #18).
