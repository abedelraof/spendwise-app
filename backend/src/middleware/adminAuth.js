const { queryOne } = require('../db/database');

module.exports = async function adminAuth(req, res, next) {
  try {
    const user = await queryOne('SELECT is_admin FROM users WHERE id = $1', [req.user.userId]);
    if (!user || user.is_admin !== 1) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  } catch (err) {
    next(err);
  }
};
