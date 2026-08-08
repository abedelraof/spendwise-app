const { query, pool } = require('../db/database');

const findByUser = (userId) =>
  query('SELECT * FROM buckets WHERE user_id = $1 ORDER BY sort_order ASC, created_at ASC', [userId]);

// Replaces an expense's bucket assignments with exactly `bucketIds` (empty = clear).
// Everything is scoped to userId so a caller can't assign someone else's expense or
// link to a bucket they don't own. Runs in one transaction so a bad bucket id can't
// leave the expense half-reassigned.
async function setExpenseBuckets(userId, expenseId, bucketIds) {
  const ids = [...new Set((bucketIds || []).map(Number).filter(Number.isInteger))];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const owns = await client.query(
      'SELECT 1 FROM expenses WHERE id = $1 AND user_id = $2',
      [expenseId, userId]
    );
    if (!owns.rowCount) {
      await client.query('ROLLBACK');
      return false;
    }

    await client.query('DELETE FROM expense_buckets WHERE expense_id = $1 AND user_id = $2', [expenseId, userId]);

    if (ids.length) {
      // INSERT ... SELECT filtered to the user's own buckets — silently drops any
      // id that isn't theirs rather than erroring on a foreign-key violation.
      await client.query(
        `INSERT INTO expense_buckets (expense_id, bucket_id, user_id)
         SELECT $1, b.id, $2 FROM buckets b
         WHERE b.id = ANY($3) AND b.user_id = $2
         ON CONFLICT DO NOTHING`,
        [expenseId, userId, ids]
      );
    }

    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { findByUser, setExpenseBuckets };
