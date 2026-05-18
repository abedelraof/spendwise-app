const db = require('../db/database');

const EXPENSE_SELECT = `
  SELECT e.*,
    c.name AS category_name, c.icon AS category_icon, c.color AS category_color,
    s.name AS subcategory_name
  FROM expenses e
  LEFT JOIN categories c ON e.category_id = c.id
  LEFT JOIN subcategories s ON e.subcategory_id = s.id
`;

const insertMany = db.transaction((userId, expenses) => {
  const stmt = db.prepare(`
    INSERT INTO expenses (user_id, amount, currency, exchange_rate, date, category_id, subcategory_id,
      description, notes, tags, raw_text, is_recurring, recurring_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const ids = [];
  for (const e of expenses) {
    const r = stmt.run(
      userId, e.amount, e.currency || 'EGP', e.exchange_rate || 1.0,
      e.date, e.category_id || null, e.subcategory_id || null,
      e.description || null, e.notes || null, e.tags || null,
      e.raw_text || null, e.is_recurring || 0, e.recurring_id || null
    );
    ids.push(r.lastInsertRowid);
  }
  return ids;
});

function buildListQuery(userId, filters) {
  const { startDate, endDate, categoryIds, subcategoryIds, minAmount, maxAmount, search, tags,
    sortBy = 'date', sortDir = 'DESC', limit = 20, offset = 0 } = filters;

  const where = ['e.user_id = ?'];
  const params = [userId];

  if (startDate) { where.push('e.date >= ?'); params.push(startDate); }
  if (endDate) { where.push('e.date <= ?'); params.push(endDate); }
  if (categoryIds?.length) {
    where.push(`e.category_id IN (${categoryIds.map(() => '?').join(',')})`);
    params.push(...categoryIds);
  }
  if (subcategoryIds?.length) {
    where.push(`e.subcategory_id IN (${subcategoryIds.map(() => '?').join(',')})`);
    params.push(...subcategoryIds);
  }
  if (minAmount) { where.push('e.amount >= ?'); params.push(Number(minAmount)); }
  if (maxAmount) { where.push('e.amount <= ?'); params.push(Number(maxAmount)); }
  if (search) {
    where.push("(e.description LIKE ? OR e.notes LIKE ? OR e.raw_text LIKE ? OR e.tags LIKE ?)");
    const term = `%${search}%`;
    params.push(term, term, term, term);
  }
  if (tags) {
    where.push('e.tags LIKE ?');
    params.push(`%${tags}%`);
  }

  const allowed = { date: 'e.date', amount: 'e.amount', created_at: 'e.created_at' };
  const orderCol = allowed[sortBy] || 'e.date';
  const dir = sortDir === 'ASC' ? 'ASC' : 'DESC';

  return { where: where.join(' AND '), params, orderCol, dir, limit: Number(limit), offset: Number(offset) };
}

const findByUser = (userId, filters = {}) => {
  const { where, params, orderCol, dir, limit, offset } = buildListQuery(userId, filters);
  const rows = db.prepare(`${EXPENSE_SELECT} WHERE ${where} ORDER BY ${orderCol} ${dir} LIMIT ? OFFSET ?`)
    .all(...params, limit, offset);
  const total = db.prepare(`SELECT COUNT(*) as cnt FROM expenses e WHERE ${where}`).get(...params).cnt;
  return { expenses: rows, total };
};

const findAll = (userId, filters = {}) => {
  const { where, params, orderCol, dir } = buildListQuery(userId, filters);
  return db.prepare(`${EXPENSE_SELECT} WHERE ${where} ORDER BY ${orderCol} ${dir}`).all(...params);
};

const findById = (id, userId) =>
  db.prepare(`${EXPENSE_SELECT} WHERE e.id = ? AND e.user_id = ?`).get(id, userId);

const update = (id, userId, fields) => {
  const allowed = ['amount','currency','exchange_rate','date','category_id','subcategory_id','description','notes','tags'];
  const sets = [];
  const vals = [];
  for (const [k, v] of Object.entries(fields)) {
    if (allowed.includes(k)) { sets.push(`${k} = ?`); vals.push(v); }
  }
  if (!sets.length) return null;
  vals.push(id, userId);
  db.prepare(`UPDATE expenses SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).run(...vals);
  return findById(id, userId);
};

const remove = (id, userId) =>
  db.prepare('DELETE FROM expenses WHERE id = ? AND user_id = ?').run(id, userId);

const bulkRemove = db.transaction((ids, userId) => {
  const stmt = db.prepare('DELETE FROM expenses WHERE id = ? AND user_id = ?');
  for (const id of ids) stmt.run(id, userId);
});

module.exports = { insertMany, findByUser, findAll, findById, update, remove, bulkRemove };
