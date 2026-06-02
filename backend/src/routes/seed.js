const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');
const { pool } = require('../db/database');

// Helper: ISO date N days from today (negative = past, positive = future)
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

// POST /api/seed
router.post('/', auth, async (req, res) => {
  const userId = req.user.userId;
  const client = await pool.connect();

  try {
    // Check if user already has data
    const existing = await client.query('SELECT COUNT(*)::int AS cnt FROM expenses WHERE user_id = $1', [userId]);
    if (existing.rows[0].cnt > 0) {
      client.release();
      return res.json({ alreadySeeded: true, message: 'You already have data. Clear it first from the Danger Zone.' });
    }

    await client.query('BEGIN');

    // ─── 1. CATEGORIES ────────────────────────────────────────────────────────
    const categoryDefs = [
      { name: 'Food',          icon: '🍔', color: '#FF6B6B' },
      { name: 'Transport',     icon: '🚗', color: '#4ECDC4' },
      { name: 'Housing',       icon: '🏠', color: '#45B7D1' },
      { name: 'Health',        icon: '💊', color: '#96CEB4' },
      { name: 'Entertainment', icon: '🎬', color: '#FFEAA7' },
      { name: 'Shopping',      icon: '🛍️', color: '#DDA0DD' },
      { name: 'Education',     icon: '📚', color: '#98D8C8' },
      { name: 'Utilities',     icon: '⚡', color: '#F7DC6F' },
    ];

    const subcategoryDefs = {
      'Food':          ['Restaurants', 'Groceries'],
      'Transport':     ['Fuel', 'Uber'],
      'Housing':       ['Rent', 'Maintenance'],
      'Health':        ['Pharmacy', 'Gym'],
      'Entertainment': ['Streaming', 'Cinema'],
      'Shopping':      ['Clothes', 'Electronics'],
      'Education':     ['Courses', 'Books'],
      'Utilities':     ['Electricity', 'Internet'],
    };

    const categoryIds    = {};
    const subcategoryIds = {};

    for (const cat of categoryDefs) {
      const r = await client.query(
        `INSERT INTO categories (user_id, name, icon, color)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, name) DO UPDATE SET icon = EXCLUDED.icon, color = EXCLUDED.color
         RETURNING id`,
        [userId, cat.name, cat.icon, cat.color]
      );
      categoryIds[cat.name] = r.rows[0].id;
      subcategoryIds[cat.name] = {};

      for (const sub of subcategoryDefs[cat.name]) {
        const sr = await client.query(
          `INSERT INTO subcategories (category_id, user_id, name)
           VALUES ($1, $2, $3)
           ON CONFLICT (category_id, name) DO NOTHING
           RETURNING id`,
          [categoryIds[cat.name], userId, sub]
        );
        // If ON CONFLICT DO NOTHING, fetch existing
        if (sr.rows.length > 0) {
          subcategoryIds[cat.name][sub] = sr.rows[0].id;
        } else {
          const existing = await client.query(
            'SELECT id FROM subcategories WHERE category_id = $1 AND name = $2',
            [categoryIds[cat.name], sub]
          );
          subcategoryIds[cat.name][sub] = existing.rows[0].id;
        }
      }
    }

    // ─── 2. ACCOUNTS ──────────────────────────────────────────────────────────
    const accountDefs = [
      { name: 'CIB Savings', currency: 'EGP', icon: '🏦', type: 'monetary' },
      { name: 'Wallet',      currency: 'EGP', icon: '👛', type: 'monetary' },
      { name: 'USD Account', currency: 'USD', icon: '💵', type: 'monetary' },
      { name: 'Gold',        currency: 'EGP', icon: '🥇', type: 'commodity' },
    ];

    const accountIds = {};
    for (const acc of accountDefs) {
      const r = await client.query(
        `INSERT INTO accounts (user_id, name, currency, icon, type)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [userId, acc.name, acc.currency, acc.icon, acc.type]
      );
      accountIds[acc.name] = r.rows[0].id;
    }

    // ─── 3. ACCOUNT BALANCES ──────────────────────────────────────────────────
    const balances = [
      [accountIds['CIB Savings'], userId, 38000, null,  null,  1.0,  daysAgo(60)],
      [accountIds['CIB Savings'], userId, 45000, null,  null,  1.0,  daysAgo(5)],
      [accountIds['Wallet'],      userId, 2000,  null,  null,  1.0,  daysAgo(30)],
      [accountIds['Wallet'],      userId, 1200,  null,  null,  1.0,  daysAgo(2)],
      [accountIds['USD Account'], userId, 25000, null,  null,  50.0, daysAgo(45)],
      [accountIds['USD Account'], userId, 25250, null,  null,  50.5, daysAgo(3)],
      [accountIds['Gold'],        userId, 36000, 10,    3600,  1.0,  daysAgo(90)],
      [accountIds['Gold'],        userId, 38000, 10,    3800,  1.0,  daysAgo(10)],
    ];

    for (const [aid, uid, bal, qty, ppu, rate, date] of balances) {
      await client.query(
        `INSERT INTO account_balances (account_id, user_id, balance, quantity, price_per_unit, exchange_rate, recorded_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [aid, uid, bal, qty, ppu, rate, date]
      );
    }

    // ─── 4. EXPENSES ──────────────────────────────────────────────────────────
    const expenseDefs = [
      { cat: 'Food', sub: 'Restaurants',
        rows: [[120,'Lunch at Cairo Kitchen',2],[85,'Dinner with family',5],[200,'Brunch at The Nile',9],[95,'Quick lunch',14],[145,'Dinner out',18],[175,'Weekend brunch',23],[65,'Coffee and snacks',28],[110,'Team lunch',35]] },
      { cat: 'Food', sub: 'Groceries',
        rows: [[350,'Weekly groceries',3],[280,'Supermarket run',17],[420,'Monthly groceries',33],[310,'Vegetables and fruits',55]] },
      { cat: 'Transport', sub: 'Fuel',
        rows: [[250,'Fuel refill',7],[230,'Gas station',30],[260,'Fuel',60]] },
      { cat: 'Transport', sub: 'Uber',
        rows: [[45,'Uber to office',1],[60,'Uber home',6],[35,'Uber ride',11],[80,'Airport trip',20],[55,'Uber to mall',40]] },
      { cat: 'Housing', sub: 'Rent',
        rows: [[8000,'Monthly rent',15],[8000,'Monthly rent',45],[8000,'Monthly rent',75]] },
      { cat: 'Housing', sub: 'Maintenance',
        rows: [[500,'Plumber repair',25],[1200,'AC maintenance',70]] },
      { cat: 'Health', sub: 'Pharmacy',
        rows: [[85,'Vitamins',4],[120,'Medicine',22],[200,'Pharmacy',50]] },
      { cat: 'Health', sub: 'Gym',
        rows: [[600,'Gym membership',30],[600,'Gym membership',60]] },
      { cat: 'Entertainment', sub: 'Streaming',
        rows: [[149,'Netflix subscription',10],[149,'Netflix subscription',40],[99,'Spotify Premium',70]] },
      { cat: 'Entertainment', sub: 'Cinema',
        rows: [[120,'Cinema tickets',12],[180,'Movie night',45]] },
      { cat: 'Shopping', sub: 'Clothes',
        rows: [[850,'Summer clothes',20],[1200,'Shoes and jeans',65]] },
      { cat: 'Shopping', sub: 'Electronics',
        rows: [[1500,'Wireless earbuds',80]] },
      { cat: 'Education', sub: 'Courses',
        rows: [[800,'Udemy Flutter course',35],[450,'Arabic design course',75]] },
      { cat: 'Utilities', sub: 'Electricity',
        rows: [[320,'Electricity bill',20],[290,'Electricity bill',50],[350,'Electricity bill',80]] },
      { cat: 'Utilities', sub: 'Internet',
        rows: [[399,'Internet bill',15],[399,'Internet bill',45],[399,'Internet bill',75]] },
    ];

    let expenseCount = 0;
    for (const group of expenseDefs) {
      const catId = categoryIds[group.cat];
      const subId = subcategoryIds[group.cat][group.sub];
      for (const [amount, description, daysBack] of group.rows) {
        await client.query(
          `INSERT INTO expenses (user_id, amount, currency, exchange_rate, date, category_id, subcategory_id, description)
           VALUES ($1,$2,'EGP',1.0,$3,$4,$5,$6)`,
          [userId, amount, daysAgo(daysBack), catId, subId, description]
        );
        expenseCount++;
      }
    }

    // ─── 5. INCOME ────────────────────────────────────────────────────────────
    const incomes = [
      [15000, 'EGP', 1.0, daysAgo(5),  'Salary',     'Monthly salary - Month 1'],
      [15000, 'EGP', 1.0, daysAgo(35), 'Salary',     'Monthly salary - Month 2'],
      [15000, 'EGP', 1.0, daysAgo(65), 'Salary',     'Monthly salary - Month 3'],
      [3500,  'EGP', 1.0, daysAgo(20), 'Freelance',  'Logo design project'],
      [5000,  'EGP', 1.0, daysAgo(50), 'Business',   'Consulting payment'],
      [800,   'EGP', 1.0, daysAgo(40), 'Investment', 'Dividends'],
      [500,   'EGP', 1.0, daysAgo(70), 'Gift',       'Birthday gift'],
    ];

    for (const [amount, currency, rate, date, source, description] of incomes) {
      await client.query(
        `INSERT INTO incomes (user_id, amount, currency, exchange_rate, date, source, description)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [userId, amount, currency, rate, date, source, description]
      );
    }

    // ─── 6. BUDGETS ───────────────────────────────────────────────────────────
    const budgets = [
      [categoryIds['Food'],          2500],
      [categoryIds['Transport'],     1500],
      [categoryIds['Entertainment'],  500],
      [categoryIds['Shopping'],      2000],
      [categoryIds['Utilities'],     1000],
    ];

    for (const [catId, amount] of budgets) {
      await client.query(
        `INSERT INTO budgets (user_id, category_id, amount, period)
         VALUES ($1,$2,$3,'monthly') ON CONFLICT (user_id, category_id, period) DO NOTHING`,
        [userId, catId, amount]
      );
    }

    // ─── 7. RECURRING EXPENSES ────────────────────────────────────────────────
    const recurring = [
      [149, categoryIds['Entertainment'], subcategoryIds['Entertainment']['Streaming'], 'Netflix subscription', 'monthly', daysAgo(-10)],
      [600, categoryIds['Health'],        subcategoryIds['Health']['Gym'],              'Gym membership',       'monthly', daysAgo(-5)],
      [399, categoryIds['Utilities'],     subcategoryIds['Utilities']['Internet'],      'Internet bill',        'monthly', daysAgo(-8)],
    ];

    for (const [amount, catId, subId, description, interval, nextDate] of recurring) {
      await client.query(
        `INSERT INTO recurring_expenses (user_id, amount, currency, exchange_rate, category_id, subcategory_id, description, interval_type, next_due_date)
         VALUES ($1,$2,'EGP',1.0,$3,$4,$5,$6,$7)`,
        [userId, amount, catId, subId, description, interval, nextDate]
      );
    }

    // ─── 8. SAVINGS GOALS ─────────────────────────────────────────────────────
    await client.query(
      `INSERT INTO savings_goals (user_id, account_id, name, icon, target_amount, target_currency, current_amount, target_date)
       VALUES ($1, NULL, 'New Laptop', '💻', 25000, 'EGP', 12000, $2)`,
      [userId, daysAgo(-120)]
    );
    await client.query(
      `INSERT INTO savings_goals (user_id, account_id, name, icon, target_amount, target_currency, current_amount, target_date)
       VALUES ($1, $2, 'Emergency Fund', '🛡️', 50000, 'EGP', 0, $3)`,
      [userId, accountIds['CIB Savings'], daysAgo(-180)]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      summary: {
        categories: categoryDefs.length,
        expenses: expenseCount,
        income: incomes.length,
        accounts: accountDefs.length,
        budgets: budgets.length,
        recurring: recurring.length,
        goals: 2,
      },
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed error:', err);
    res.status(500).json({ error: 'Failed to seed data: ' + err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
