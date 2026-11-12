const router = require('express').Router();
const auth = require('../middleware/auth');
const { listPending, confirmPending, rejectPending, HttpError } = require('../services/pendingService');

const parseId = (req) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid id');
  return id;
};

router.get('/', auth, async (req, res, next) => {
  try {
    res.json({ pending: await listPending(req.user.userId) });
  } catch (err) { next(err); }
});

// Body (all optional) lets the user correct what the parser got wrong before saving:
// { type, amount, currency, date, description, category, source }
router.post('/:id/confirm', auth, async (req, res, next) => {
  try {
    res.status(201).json(await confirmPending(req.user.userId, parseId(req), req.body));
  } catch (err) { next(err); }
});

router.post('/:id/reject', auth, async (req, res, next) => {
  try {
    await rejectPending(req.user.userId, parseId(req));
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
