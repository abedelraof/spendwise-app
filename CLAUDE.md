# SpendWise — Project Documentation

## What Is This

SpendWise is a personal finance tracker built as a full-stack web app. It tracks expenses, income, budgets, recurring bills, multi-currency bank accounts, savings goals, and produces reports. It includes a Claude AI integration for parsing natural-language expense descriptions and generating monthly financial insights.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + Vite, Tailwind CSS, Recharts, Lucide icons |
| Backend | Node.js + Express 5, SQLite via better-sqlite3 |
| Auth | JWT (jsonwebtoken) + bcryptjs password hashing |
| AI | Anthropic Claude SDK (`@anthropic-ai/sdk`) |
| Scheduler | node-cron (daily recurring expense processing) |
| Exchange rates | open.er-api.com (1-hour cached proxy) |
| Encryption | AES-256-GCM via Node crypto (for stored API keys) |

**Ports:** Backend `3001`, Frontend (Vite dev) `5173`

**Start commands:**
```
backend:  cd D:\FlutterApp\backend  && npm run dev   (nodemon)
frontend: cd D:\FlutterApp\frontend && npm run dev   (vite)
```

**Required env vars** (`backend/.env`):
```
PORT=3001
JWT_SECRET=<32+ char secret>
```

---

## Directory Layout

```
D:\FlutterApp\
├── backend/
│   └── src/
│       ├── app.js              ← Express app, all route mounts
│       ├── server.js           ← HTTP listen, migrations, cron setup
│       ├── db/
│       │   ├── database.js     ← better-sqlite3 singleton
│       │   └── migrations.js   ← CREATE TABLE IF NOT EXISTS (runs on startup)
│       ├── middleware/
│       │   └── auth.js         ← JWT verification → req.user.userId
│       ├── models/
│       │   ├── userModel.js
│       │   ├── categoryModel.js
│       │   ├── subcategoryModel.js
│       │   └── expenseModel.js
│       ├── routes/
│       │   ├── auth.js         ← POST /login, POST /signup
│       │   ├── settings.js     ← GET/PUT /settings
│       │   ├── categories.js   ← CRUD /categories + subcategories
│       │   ├── expenses.js     ← CRUD /expenses
│       │   ├── budgets.js      ← CRUD /budgets
│       │   ├── recurring.js    ← CRUD /recurring
│       │   ├── accounts.js     ← CRUD /accounts + balance snapshots
│       │   ├── income.js       ← CRUD /income (filterable list)
│       │   ├── goals.js        ← CRUD /goals (savings goals)
│       │   ├── reports.js      ← GET /reports/* (trend, breakdown, topDays, export)
│       │   ├── ai.js           ← POST /ai/parse, GET /ai/insights
│       │   ├── insights.js     ← Monthly AI insight generation
│       │   ├── rates.js        ← GET /rates?base=X (cached exchange rates)
│       │   ├── search.js       ← GET /search?q=
│       │   └── import.js       ← POST /import/csv
│       ├── services/
│       │   ├── aiService.js          ← Claude API calls (parse + insights)
│       │   ├── expenseService.js     ← getDashboardStats (incomeThisMonth included)
│       │   ├── categoryService.js    ← find-or-create category by name
│       │   ├── budgetService.js      ← budget limit checks
│       │   ├── recurringService.js   ← processOverdue() → inserts expenses + advances dates
│       │   └── cryptoService.js      ← encrypt()/decrypt() AES-256-GCM
│       └── utils/
│           ├── dateUtils.js    ← todayISO(), addInterval(), getMonthRange()
│           └── csvExport.js    ← expenses → CSV string
└── frontend/
    └── src/
        ├── App.jsx             ← Router, ProtectedRoute wrapper
        ├── index.css           ← Tailwind + .card/.btn/.input/.label component classes
        ├── context/
        │   └── AuthContext.jsx ← token, user, login/logout/updateUser, applyTheme()
        ├── hooks/
        │   ├── useAuth.js
        │   └── useApi.js       ← axios instance with Authorization header
        ├── api/                ← thin wrappers: each file = one backend route group
        │   ├── authApi.js
        │   ├── expensesApi.js
        │   ├── categoriesApi.js
        │   ├── budgetsApi.js
        │   ├── recurringApi.js
        │   ├── reportsApi.js
        │   ├── accountsApi.js
        │   ├── incomeApi.js
        │   ├── goalsApi.js
        │   ├── aiApi.js
        │   └── settingsApi.js
        ├── pages/
        │   ├── Dashboard.jsx       ← Stats, AI input, latest transactions, budget alerts
        │   ├── Transactions.jsx    ← Filterable expense table, pagination
        │   ├── Reports.jsx         ← Charts: daily, weekly, category pie + summary, trend
        │   ├── Recurring.jsx       ← List + add/delete recurring expenses
        │   ├── Accounts.jsx        ← Multi-account, balance snapshots, savings goals, net worth
        │   ├── Income.jsx          ← Income entries, filters, source badges
        │   ├── Settings.jsx        ← Preferences, Claude API key, categories, budgets, CSV import
        │   ├── Login.jsx
        │   └── Signup.jsx
        └── components/
            ├── auth/
            │   ├── ProtectedRoute.jsx
            │   └── PublicHome.jsx
            ├── common/
            │   ├── Modal.jsx
            │   ├── Toast.jsx
            │   ├── Spinner.jsx
            │   ├── EmptyState.jsx
            │   ├── GlobalSearch.jsx    ← Ctrl+K search
            │   └── TagInput.jsx
            ├── layout/
            │   ├── AppShell.jsx        ← Desktop sidebar + mobile hamburger drawer
            │   └── Sidebar.jsx         ← Nav links: Dashboard, Transactions, Reports, Recurring, Accounts, Income, Settings
            ├── dashboard/
            │   ├── StatsBar.jsx        ← Row 1: Spent/Category/Daily/Transactions; Row 2: Income/CashFlow/NetWorth
            │   ├── StatCard.jsx
            │   ├── ExpenseInputPanel.jsx
            │   ├── ParsedExpenseConfirm.jsx
            │   ├── LatestTransactions.jsx
            │   ├── BudgetAlerts.jsx
            │   └── MonthlyInsight.jsx
            └── settings/
                ├── CategoriesManager.jsx
                ├── BudgetManager.jsx
                └── CsvImport.jsx
```

---

## Database Schema

All tables created with `IF NOT EXISTS` in `migrations.js` on every startup.

```sql
users (id, email, password_hash, currency, accounts_currency, theme, claude_api_key, created_at)

categories (id, user_id, name, icon, color, created_at)
subcategories (id, category_id, user_id, name, created_at)

expenses (
  id, user_id, amount, currency, exchange_rate, date,
  category_id, subcategory_id, description, tags, notes,
  is_recurring, recurring_id, created_at
)

budgets (id, user_id, category_id, amount, period, created_at)

recurring_expenses (
  id, user_id, amount, currency, exchange_rate,
  category_id, subcategory_id, description, tags,
  interval_type, next_due_date, created_at
)
-- INDEX: (user_id, next_due_date)

monthly_insights (id, user_id, year_month, insight_text, created_at)

accounts (
  id, user_id, name, type,         -- type: 'monetary' | 'commodity' | 'liability'
  currency, icon, color, notes, created_at
)

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
```

---

## Key Features & How They Work

### Authentication
- `POST /api/auth/login` → verifies bcrypt hash → returns JWT
- JWT signed with `JWT_SECRET`, decoded in `middleware/auth.js` → sets `req.user.userId`
- Frontend stores token in localStorage, attaches via `Authorization: Bearer` header in `useApi.js`

### Expense Parsing (AI)
- User types natural language in `ExpenseInputPanel` ("coffee 45 EGP, lunch 120")
- `POST /api/ai/parse` → aiService calls Claude with structured prompt → returns parsed expense array
- User confirms in `ParsedExpenseConfirm` modal → bulk inserted via `POST /api/expenses`

### Monthly Insights (AI)
- `MonthlyInsight` component on Dashboard calls `GET /api/ai/insights`
- `insights.js` route checks if insight for current month already exists in `monthly_insights` table
- If not, calls Claude with spending data → stores result → returns markdown text
- Rendered with `react-markdown`

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

### Multi-Currency Accounts
- Each account has its own `currency`
- Balance snapshots store `exchange_rate` at time of entry (commodity: `quantity × price_per_unit = balance`)
- Net Worth = Σ(asset balances converted to home currency) − Σ(liability balances converted)
- Accounts page: asset accounts + liability accounts shown in separate sections
- Trend chart builds date-grouped totals subtracting liabilities

### Savings Goals
- Can be linked to an account (`account_id`) → progress = `account.latest_balance / target_amount`
- Or tracked manually → progress = `current_amount / target_amount`
- Days-left badge: amber < 30 days, red if overdue

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
| POST | `/login` | Email + password → JWT |
| POST | `/signup` | Create account → JWT |

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
| PUT | `/:id` | Update account |
| DELETE | `/:id` | Delete account |
| POST | `/balances` | Add balance snapshot |
| PUT | `/balances/:id` | Edit snapshot |
| DELETE | `/balances/:id` | Delete snapshot |
| GET | `/:id/history` | All snapshots for account |

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
| GET | `/` | currency, accounts_currency, theme, hasApiKey |
| PUT | `/` | Update currency, theme, claudeApiKey, accounts_currency |

### AI — `/api/ai`
| Method | Path | Description |
|--------|------|-------------|
| POST | `/parse` | Natural language → expense array |
| GET | `/insights` | Monthly AI insight (cached in DB) |

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

## Things to Know / Gotchas

1. **Exchange rate fallback**: Records inserted before the exchange rate feature was added have `exchange_rate=1.0`. The Accounts page detects this (`exchange_rate === 1.0 && currency !== homeCurrency`) and uses live rates as approximation, shown with `~` prefix.

2. **Liability accounts**: `accounts.type = 'liability'` is valid with no schema change (no CHECK constraint). Net worth subtracts them. They appear in a separate "Liabilities" section on the Accounts page.

3. **Commodity accounts**: Use `quantity` × `price_per_unit` to compute `balance`. Gold, stocks, etc. Balance snapshots store all three fields.

4. **Savings goals progress**: If `account_id` is set, progress reads `latest_balance` from the joined account query. If null, reads `current_amount` from the goal itself.

5. **Recurring expenses**: `processOverdue()` handles multiple missed intervals in one call (keeps advancing `next_due_date` until it's in the future isn't needed — it only fires once per call, so if 3 months are missed, it creates 1 expense and advances by 1 interval; the next startup/cron run creates the next one). Cron fires daily at midnight.

6. **incomeThisMonth in dashboard stats**: Added to `expenseService.getDashboardStats()` — queries the `incomes` table for the current calendar month and returns the total alongside expense stats.

7. **Theme system**: `applyTheme()` in AuthContext is a module-level function (not a hook) so it can be called from login, updateUser, and the useEffect without dependency issues.

8. **Reports page**: No longer has a Month-over-Month section (removed). `getMomComparison` still exists in expenseService (used by insights route) but the `/mom-comparison` HTTP route was deleted.

9. **CSV import**: Parses uploaded file via `csv-parse`, auto-matches categories via `categoryService.findOrCreate()`.

10. **Global search**: `Ctrl+K` dispatched from AppShell header button; `GlobalSearch.jsx` listens for the keyboard event and renders a search overlay.
