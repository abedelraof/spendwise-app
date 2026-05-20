const router = require('express').Router();
const auth = require('../middleware/auth');
const categoryModel = require('../models/categoryModel');
const subcategoryModel = require('../models/subcategoryModel');

router.get('/', auth, async (req, res, next) => {
  try {
    res.json({ categories: await categoryModel.findByUser(req.user.userId) });
  } catch (err) { next(err); }
});

router.post('/', auth, async (req, res, next) => {
  try {
    const { name, icon, color } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    await categoryModel.create(req.user.userId, { name, icon, color });
    res.status(201).json({ categories: await categoryModel.findByUser(req.user.userId) });
  } catch (err) { next(err); }
});

router.delete('/:id', auth, async (req, res, next) => {
  try {
    const result = await categoryModel.remove(req.user.userId, req.params.id);
    if (!result.rowCount) return res.status(400).json({ error: 'Cannot delete default category or not found' });
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.post('/:id/subcategories', auth, async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    await subcategoryModel.create(req.params.id, req.user.userId, name);
    res.status(201).json({ categories: await categoryModel.findByUser(req.user.userId) });
  } catch (err) { next(err); }
});

router.delete('/subcategories/:id', auth, async (req, res, next) => {
  try {
    await subcategoryModel.remove(req.user.userId, req.params.id);
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
