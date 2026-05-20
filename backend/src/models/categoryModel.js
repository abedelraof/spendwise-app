const { query, queryOne, execute, pool } = require('../db/database');

const DEFAULTS = [
  { name: 'Food',          icon: '🍔', color: '#f97316', subs: ['Lunch','Dinner','Breakfast','Groceries','Coffee','Snacks','Delivery'] },
  { name: 'Transport',     icon: '🚗', color: '#3b82f6', subs: ['Uber','Taxi','Bus','Metro','Fuel','Parking','Car Service'] },
  { name: 'Housing',       icon: '🏠', color: '#8b5cf6', subs: ['Rent','Electricity','Water','Internet','Gas Bill','Maintenance'] },
  { name: 'Entertainment', icon: '🎬', color: '#ec4899', subs: ['Movies','Games','Streaming','Books','Concert','Sports'] },
  { name: 'Health',        icon: '💊', color: '#10b981', subs: ['Pharmacy','Doctor','Gym','Supplements'] },
  { name: 'Shopping',      icon: '🛍️', color: '#f59e0b', subs: ['Clothes','Electronics','Accessories','Home Goods'] },
  { name: 'Education',     icon: '📚', color: '#6366f1', subs: ['Course','Books','Stationery','Tuition'] },
  { name: 'Utilities',     icon: '⚡', color: '#14b8a6', subs: ['Mobile Bill','Subscriptions','Water Bill'] },
  { name: 'Other',         icon: '📦', color: '#6b7280', subs: ['Miscellaneous'] },
];

const seedDefaults = async (userId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const cat of DEFAULTS) {
      await client.query(
        `INSERT INTO categories (user_id, name, icon, color, is_default)
         VALUES ($1, $2, $3, $4, 1) ON CONFLICT (user_id, name) DO NOTHING`,
        [userId, cat.name, cat.icon, cat.color]
      );
      const row = await client.query(
        'SELECT id FROM categories WHERE user_id = $1 AND name = $2',
        [userId, cat.name]
      );
      const catId = row.rows[0]?.id;
      if (catId) {
        for (const sub of cat.subs) {
          await client.query(
            `INSERT INTO subcategories (category_id, user_id, name)
             VALUES ($1, $2, $3) ON CONFLICT (category_id, name) DO NOTHING`,
            [catId, userId, sub]
          );
        }
      }
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};

const findByUser = async (userId) => {
  const cats = await query(
    'SELECT * FROM categories WHERE user_id = $1 ORDER BY is_default DESC, name',
    [userId]
  );
  const subs = await query(
    'SELECT * FROM subcategories WHERE user_id = $1 ORDER BY name',
    [userId]
  );
  return cats.map(c => ({ ...c, subcategories: subs.filter(s => s.category_id === c.id) }));
};

const findByName = (userId, name) =>
  queryOne(
    'SELECT * FROM categories WHERE user_id = $1 AND LOWER(name) = LOWER($2)',
    [userId, name]
  );

const create = async (userId, { name, icon, color }) => {
  const row = await queryOne(
    'INSERT INTO categories (user_id, name, icon, color) VALUES ($1, $2, $3, $4) RETURNING id',
    [userId, name, icon || '📦', color || '#6b7280']
  );
  return { lastInsertRowid: row.id };
};

const remove = (userId, id) =>
  execute(
    'DELETE FROM categories WHERE id = $1 AND user_id = $2 AND is_default = 0',
    [id, userId]
  );

module.exports = { seedDefaults, findByUser, findByName, create, remove };
