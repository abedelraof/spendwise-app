const { query, queryOne, execute } = require('../db/database');

const findByCategory = (categoryId) =>
  query('SELECT * FROM subcategories WHERE category_id = $1 ORDER BY name', [categoryId]);

const create = (categoryId, userId, name) =>
  execute(
    'INSERT INTO subcategories (category_id, user_id, name) VALUES ($1, $2, $3) ON CONFLICT (category_id, name) DO NOTHING',
    [categoryId, userId, name]
  );

const findOrCreate = async (categoryId, userId, name) => {
  let row = await queryOne(
    'SELECT * FROM subcategories WHERE category_id = $1 AND LOWER(name) = LOWER($2)',
    [categoryId, name]
  );
  if (!row) {
    await execute(
      'INSERT INTO subcategories (category_id, user_id, name) VALUES ($1, $2, $3) ON CONFLICT (category_id, name) DO NOTHING',
      [categoryId, userId, name]
    );
    row = await queryOne(
      'SELECT * FROM subcategories WHERE category_id = $1 AND LOWER(name) = LOWER($2)',
      [categoryId, name]
    );
  }
  return row;
};

const remove = (userId, id) =>
  execute('DELETE FROM subcategories WHERE id = $1 AND user_id = $2', [id, userId]);

module.exports = { findByCategory, create, findOrCreate, remove };
