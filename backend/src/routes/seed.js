const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const db = require('../db/database');

// Helper: date N days ago
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

// Helper: random int between min and max
function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// POST /api/seed
router.post('/', auth, (req, res) => {
  const userId = req.user.userId;

  // Check if user already has data
  const existingExpenses = db.prepare('SELECT COUNT(*) as cnt FROM expenses WHERE user_id = ?').get(userId);
  if (existingExpenses.cnt > 0) {
    return res.json({ alreadySeeded: true, message: 'You already have data. Clear it first from the Danger Zone.' });
  }

  const seedAll = db.transaction(() => {

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

    const insertCat = db.prepare(
      'INSERT OR IGNORE INTO categories (user_id, name, icon, color) VALUES (?, ?, ?, ?)'
    );
    const getCat = db.prepare('SELECT id FROM categories WHERE user_id = ? AND name = ?');
    const insertSub = db.prepare(
      'INSERT OR IGNORE INTO subcategories (category_id, user_id, name) VALUES (?, ?, ?)'
    );
    const getSub = db.prepare('SELECT id FROM subcategories WHERE category_id = ? AND name = ?');

    const categoryIds = {};
    const subcategoryIds = {};

    for (const cat of categoryDefs) {
      insertCat.run(userId, cat.name, cat.icon, cat.color);
      const row = getCat.get(userId, cat.name);
      categoryIds[cat.name] = row.id;
      subcategoryIds[cat.name] = {};
      for (const sub of subcategoryDefs[cat.name]) {
        insertSub.run(row.id, userId, sub);
        const subRow = getSub.get(row.id, sub);
        subcategoryIds[cat.name][sub] = subRow.id;
      }
    }

    // ─── 2. ACCOUNTS ──────────────────────────────────────────────────────────
    const insertAccount = db.prepare(
      `INSERT INTO accounts (user_id, name, currency, icon, type) VALUES (?, ?, ?, ?, ?)`
    );
    const getAccount = db.prepare('SELECT id FROM accounts WHERE user_id = ? AND name = ?');

    const accountDefs = [
      { name: 'CIB Savings', currency: 'EGP', icon: '🏦', type: 'monetary' },
      { name: 'Wallet',      currency: 'EGP', icon: '👛', type: 'monetary' },
      { name: 'USD Account', currency: 'USD', icon: '💵', type: 'monetary' },
      { name: 'Gold',        currency: 'EGP', icon: '🥇', type: 'commodity' },
    ];

    const accountIds = {};
    for (const acc of accountDefs) {
      insertAccount.run(userId, acc.name, acc.currency, acc.icon, acc.type);
      accountIds[acc.name] = getAccount.get(userId, acc.name).id;
    }

    // ─── 3. ACCOUNT BALANCES ──────────────────────────────────────────────────
    const insertBalance = db.prepare(
      `INSERT INTO account_balances (account_id, user_id, balance, quantity, price_per_unit, exchange_rate, recorded_date)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );

    // CIB Savings: two snapshots
    insertBalance.run(accountIds['CIB Savings'], userId, 38000, null, null, 1.0, daysAgo(60));
    insertBalance.run(accountIds['CIB Savings'], userId, 45000, null, null, 1.0, daysAgo(5));
    // Wallet
    insertBalance.run(accountIds['Wallet'], userId, 2000, null, null, 1.0, daysAgo(30));
    insertBalance.run(accountIds['Wallet'], userId, 1200, null, null, 1.0, daysAgo(2));
    // USD Account
    insertBalance.run(accountIds['USD Account'], userId, 500 * 50, null, null, 50.0, daysAgo(45));
    insertBalance.run(accountIds['USD Account'], userId, 500 * 50.5, null, null, 50.5, daysAgo(3));
    // Gold (commodity: 10g @ 3800 EGP/g)
    insertBalance.run(accountIds['Gold'], userId, 10 * 3600, 10, 3600, 1.0, daysAgo(90));
    insertBalance.run(accountIds['Gold'], userId, 10 * 3800, 10, 3800, 1.0, daysAgo(10));

    // ─── 4. EXPENSES ──────────────────────────────────────────────────────────
    const insertExpense = db.prepare(
      `INSERT INTO expenses (user_id, amount, currency, exchange_rate, date, category_id, subcategory_id, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const expenseDefs = [
      // Food - Restaurants
      { cat: 'Food', sub: 'Restaurants', amounts: [120, 85, 200, 95, 145, 175, 65, 110], daysBack: [2, 5, 9, 14, 18, 23, 28, 35], descs: ['Lunch at Cairo Kitchen', 'Dinner with family', 'Brunch at The Nile', 'Quick lunch', 'Dinner out', 'Weekend brunch', 'Coffee and snacks', 'Team lunch'] },
      // Food - Groceries
      { cat: 'Food', sub: 'Groceries', amounts: [350, 280, 420, 310], daysBack: [3, 17, 33, 55], descs: ['Weekly groceries', 'Supermarket run', 'Monthly groceries', 'Vegetables and fruits'] },
      // Transport - Fuel
      { cat: 'Transport', sub: 'Fuel', amounts: [250, 230, 260], daysBack: [7, 30, 60], descs: ['Fuel refill', 'Gas station', 'Fuel'] },
      // Transport - Uber
      { cat: 'Transport', sub: 'Uber', amounts: [45, 60, 35, 80, 55], daysBack: [1, 6, 11, 20, 40], descs: ['Uber to office', 'Uber home', 'Uber ride', 'Airport trip', 'Uber to mall'] },
      // Housing - Rent
      { cat: 'Housing', sub: 'Rent', amounts: [8000, 8000], daysBack: [15, 45], descs: ['Monthly rent', 'Monthly rent'] },
      // Housing - Maintenance
      { cat: 'Housing', sub: 'Maintenance', amounts: [500, 1200], daysBack: [25, 70], descs: ['Plumber repair', 'AC maintenance'] },
      // Health - Pharmacy
      { cat: 'Health', sub: 'Pharmacy', amounts: [85, 120, 200], daysBack: [4, 22, 50], descs: ['Vitamins', 'Medicine', 'Pharmacy'] },
      // Health - Gym
      { cat: 'Health', sub: 'Gym', amounts: [600, 600], daysBack: [30, 60], descs: ['Gym membership', 'Gym membership'] },
      // Entertainment - Streaming
      { cat: 'Entertainment', sub: 'Streaming', amounts: [149, 149, 99], daysBack: [10, 40, 70], descs: ['Netflix subscription', 'Netflix subscription', 'Spotify Premium'] },
      // Entertainment - Cinema
      { cat: 'Entertainment', sub: 'Cinema', amounts: [120, 180], daysBack: [12, 45], descs: ['Cinema tickets', 'Movie night'] },
      // Shopping - Clothes
      { cat: 'Shopping', sub: 'Clothes', amounts: [850, 1200], daysBack: [20, 65], descs: ['Summer clothes', 'Shoes and jeans'] },
      // Shopping - Electronics
      { cat: 'Shopping', sub: 'Electronics', amounts: [1500], daysBack: [80], descs: ['Wireless earbuds'] },
      // Education - Courses
      { cat: 'Education', sub: 'Courses', amounts: [800, 450], daysBack: [35, 75], descs: ['Udemy Flutter course', 'Arabic design course'] },
      // Utilities - Electricity
      { cat: 'Utilities', sub: 'Electricity', amounts: [320, 290, 350], daysBack: [20, 50, 80], descs: ['Electricity bill', 'Electricity bill', 'Electricity bill'] },
      // Utilities - Internet
      { cat: 'Utilities', sub: 'Internet', amounts: [399, 399], daysBack: [15, 45], descs: ['Internet bill', 'Internet bill'] },
    ];

    for (const group of expenseDefs) {
      const catId = categoryIds[group.cat];
      const subId = subcategoryIds[group.cat][group.sub];
      for (let i = 0; i < group.amounts.length; i++) {
        insertExpense.run(userId, group.amounts[i], 'EGP', 1.0, daysAgo(group.daysBack[i]), catId, subId, group.descs[i]);
      }
    }

    // ─── 5. INCOME ────────────────────────────────────────────────────────────
    const insertIncome = db.prepare(
      `INSERT INTO incomes (user_id, amount, currency, exchange_rate, date, source, description)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );

    insertIncome.run(userId, 15000, 'EGP', 1.0, daysAgo(5),  'Salary',     'Monthly salary - May');
    insertIncome.run(userId, 15000, 'EGP', 1.0, daysAgo(35), 'Salary',     'Monthly salary - April');
    insertIncome.run(userId, 15000, 'EGP', 1.0, daysAgo(65), 'Salary',     'Monthly salary - March');
    insertIncome.run(userId, 3500,  'EGP', 1.0, daysAgo(20), 'Freelance',  'Logo design project');
    insertIncome.run(userId, 5000,  'EGP', 1.0, daysAgo(50), 'Business',   'Consulting payment');
    insertIncome.run(userId, 800,   'EGP', 1.0, daysAgo(40), 'Investment', 'Dividends');
    insertIncome.run(userId, 500,   'EGP', 1.0, daysAgo(70), 'Gift',       'Birthday gift');

    // ─── 6. BUDGETS ───────────────────────────────────────────────────────────
    const insertBudget = db.prepare(
      `INSERT OR IGNORE INTO budgets (user_id, category_id, amount, period) VALUES (?, ?, ?, ?)`
    );

    insertBudget.run(userId, categoryIds['Food'],          2500,  'monthly');
    insertBudget.run(userId, categoryIds['Transport'],     1500,  'monthly');
    insertBudget.run(userId, categoryIds['Entertainment'], 500,   'monthly');
    insertBudget.run(userId, categoryIds['Shopping'],      2000,  'monthly');
    insertBudget.run(userId, categoryIds['Utilities'],     1000,  'monthly');

    // ─── 7. RECURRING EXPENSES ────────────────────────────────────────────────
    const insertRecurring = db.prepare(
      `INSERT INTO recurring_expenses (user_id, amount, currency, exchange_rate, category_id, subcategory_id, description, interval_type, next_due_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    insertRecurring.run(userId, 149, 'EGP', 1.0, categoryIds['Entertainment'], subcategoryIds['Entertainment']['Streaming'], 'Netflix subscription', 'monthly', daysAgo(-10));
    insertRecurring.run(userId, 600, 'EGP', 1.0, categoryIds['Health'],        subcategoryIds['Health']['Gym'],              'Gym membership',       'monthly', daysAgo(-5));
    insertRecurring.run(userId, 399, 'EGP', 1.0, categoryIds['Utilities'],     subcategoryIds['Utilities']['Internet'],      'Internet bill',        'monthly', daysAgo(-8));

    // ─── 8. SAVINGS GOALS ─────────────────────────────────────────────────────
    const insertGoal = db.prepare(
      `INSERT INTO savings_goals (user_id, account_id, name, icon, target_amount, target_currency, current_amount, target_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    // Manual goal
    insertGoal.run(userId, null, 'New Laptop', '💻', 25000, 'EGP', 12000, daysAgo(-120));
    // Linked to CIB Savings account
    insertGoal.run(userId, accountIds['CIB Savings'], 'Emergency Fund', '🛡️', 50000, 'EGP', 0, daysAgo(-180));

    return {
      categories: categoryDefs.length,
      expenses: expenseDefs.reduce((sum, g) => sum + g.amounts.length, 0),
      income: 7,
      accounts: accountDefs.length,
      budgets: 5,
      recurring: 3,
      goals: 2,
    };
  });

  try {
    const summary = seedAll();
    res.json({ success: true, summary });
  } catch (err) {
    console.error('Seed error:', err);
    res.status(500).json({ error: 'Failed to seed data: ' + err.message });
  }
});

module.exports = router;
