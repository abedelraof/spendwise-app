const db = require('../db/database');

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

const seedDefaults = db.transaction((userId) => {
  const insertCat = db.prepare('INSERT OR IGNORE INTO categories (user_id, name, icon, color, is_default) VALUES (?, ?, ?, ?, 1)');
  const insertSub = db.prepare('INSERT OR IGNORE INTO subcategories (category_id, user_id, name) VALUES (?, ?, ?)');
  for (const cat of DEFAULTS) {
    insertCat.run(userId, cat.name, cat.icon, cat.color);
    const row = db.prepare('SELECT id FROM categories WHERE user_id = ? AND name = ?').get(userId, cat.name);
    for (const sub of cat.subs) insertSub.run(row.id, userId, sub);
  }
});

const findByUser = (userId) => {
  const cats = db.prepare('SELECT * FROM categories WHERE user_id = ? ORDER BY is_default DESC, name').all(userId);
  const subs = db.prepare('SELECT * FROM subcategories WHERE user_id = ? ORDER BY name').all(userId);
  return cats.map(c => ({ ...c, subcategories: subs.filter(s => s.category_id === c.id) }));
};

const findByName = (userId, name) =>
  db.prepare('SELECT * FROM categories WHERE user_id = ? AND name = ? COLLATE NOCASE').get(userId, name);

const create = (userId, { name, icon, color }) =>
  db.prepare('INSERT INTO categories (user_id, name, icon, color) VALUES (?, ?, ?, ?)').run(userId, name, icon || '📦', color || '#6b7280');

const remove = (userId, id) =>
  db.prepare('DELETE FROM categories WHERE id = ? AND user_id = ? AND is_default = 0').run(id, userId);

module.exports = { seedDefaults, findByUser, findByName, create, remove };
