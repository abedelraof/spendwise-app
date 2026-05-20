const { query, queryOne, execute, pool } = require('../db/database');

const EXPENSE_SELECT = `
  SELECT e.*,
    c.name AS category_name, c.icon AS category_icon, c.color AS category_color,
    s.name AS subcategory_name
  FROM expenses e
  LEFT JOIN categories c ON e.category_id = c.id
  LEFT JOIN subcategories s ON e.subcategory_id = s.id
`;

const insertMany = async (userId, expenses) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ids = [];
    for (const e of expenses) {
      const r = await client.query(
        `INSERT INTO expenses
           (user_id, amount, currency, exchange_rate, date, category_id, subcategory_id,
            description, notes, tags, raw_text, is_recurring, recurring_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
        [
          userId, e.amount, e.currency || 'EGP', e.exchange_rate || 1.0,
          e.date, e.category_id || null, e.subcategory_id || null,
          e.description || null, e.notes || null, e.tags || null,
          e.raw_text || null, e.is_recurring || 0, e.recurring_id || null,
        ]
      );
      ids.push(r.rows[0].id);
    }
    await client.query('COMMIT');
    return ids;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};

function buildListQuery(userId, filters) {
  const { startDate, endDate, categoryIds, subcategoryIds, minAmount, maxAmount, search, tags,
    sortBy = 'date', sortDir = 'DESC', limit = 20, offset = 0 } = filters;

  const where = ['e.user_id = $1'];
  const params = [userId];
  let idx = 2;

  if (startDate)          { where.push(`e.date >= $${idx++}`);   params.push(startDate); }
  if (endDate)            { where.push(`e.date <= $${idx++}`);   params.push(endDate); }
  if (categoryIds?.length) {
    where.push(`e.category_id = ANY($${idx++})`);
    params.push(categoryIds);
  }
  if (subcategoryIds?.length) {
    where.push(`e.subcategory_id = ANY($${idx++})`);
    params.push(subcategoryIds);
  }
  if (minAmount) { where.push(`e.amount >= $${idx++}`); params.push(Number(minAmount)); }
  if (maxAmount) { where.push(`e.amount <= $${idx++}`); params.push(Number(maxAmount)); }
  if (search) {
    where.push(`(e.description ILIKE $${idx} OR e.notes ILIKE $${idx} OR e.raw_text ILIKE $${idx} OR e.tags ILIKE $${idx})`);
    params.push(`%${search}%`); idx++;
  }
  if (tags) {
    where.push(`e.tags ILIKE $${idx++}`);
    params.push(`%${tags}%`);
  }

  const allowed = { date: 'e.date', amount: 'e.amount', created_at: 'e.created_at' };
  const orderCol = allowed[sortBy] || 'e.date';
  const dir = sortDir === 'ASC' ? 'ASC' : 'DESC';

  return { where: where.join(' AND '), params, orderCol, dir, limit: Number(limit), offset: Number(offset), idx };
}

const findByUser = async (userId, filters = {}) => {
  const { where, params, orderCol, dir, limit, offset, idx } = buildListQuery(userId, filters);
  const rows = await query(
    `${EXPENSE_SELECT} WHERE ${where} ORDER BY ${orderCol} ${dir} LIMIT $${idx} OFFSET $${idx + 1}`,
    [...params, limit, offset]
  );
  const countRow = await queryOne(
    `SELECT COUNT(*)::int AS cnt FROM expenses e WHERE ${where}`,
    params
  );
  return { expenses: rows, total: countRow.cnt };
};

const findAll = (userId, filters = {}) => {
  const { where, params, orderCol, dir } = buildListQuery(userId, filters);
  return query(`${EXPENSE_SELECT} WHERE ${where} ORDER BY ${orderCol} ${dir}`, params);
};

const findById = (id, userId) =>
  queryOne(`${EXPENSE_SELECT} WHERE e.id = $1 AND e.user_id = $2`, [id, userId]);

const update = async (id, userId, fields) => {
  const allowed = ['amount','currency','exchange_rate','date','category_id','subcategory_id','description','notes','tags'];
  const sets = []; const vals = []; let idx = 1;
  for (const [k, v] of Object.entries(fields)) {
    if (allowed.includes(k)) { sets.push(`${k} = $${idx++}`); vals.push(v); }
  }
  if (!sets.length) return null;
  vals.push(id, userId);
  await execute(`UPDATE expenses SET ${sets.join(', ')} WHERE id = $${idx++} AND user_id = $${idx}`, vals);
  return findById(id, userId);
};

const remove = (id, userId) =>
  execute('DELETE FROM expenses WHERE id = $1 AND user_id = $2', [id, userId]);

const bulkRemove = async (ids, userId) => {
  await execute('DELETE FROM expenses WHERE id = ANY($1) AND user_id = $2', [ids, userId]);
};

module.exports = { insertMany, findByUser, findAll, findById, update, remove, bulkRemove };
