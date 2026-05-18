const db = require('../db/database');

const findByCategory = (categoryId) =>
  db.prepare('SELECT * FROM subcategories WHERE category_id = ? ORDER BY name').all(categoryId);

const create = (categoryId, userId, name) =>
  db.prepare('INSERT OR IGNORE INTO subcategories (category_id, user_id, name) VALUES (?, ?, ?)').run(categoryId, userId, name);

const findOrCreate = (categoryId, userId, name) => {
  let row = db.prepare('SELECT * FROM subcategories WHERE category_id = ? AND name = ? COLLATE NOCASE').get(categoryId, name);
  if (!row) {
    db.prepare('INSERT INTO subcategories (category_id, user_id, name) VALUES (?, ?, ?)').run(categoryId, userId, name);
    row = db.prepare('SELECT * FROM subcategories WHERE category_id = ? AND name = ? COLLATE NOCASE').get(categoryId, name);
  }
  return row;
};

const remove = (userId, id) =>
  db.prepare('DELETE FROM subcategories WHERE id = ? AND user_id = ?').run(id, userId);

module.exports = { findByCategory, create, findOrCreate, remove };
