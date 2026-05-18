const router = require('express').Router();
const auth = require('../middleware/auth');
const categoryModel = require('../models/categoryModel');
const subcategoryModel = require('../models/subcategoryModel');

router.get('/', auth, (req, res) => {
  res.json({ categories: categoryModel.findByUser(req.user.userId) });
});

router.post('/', auth, (req, res) => {
  const { name, icon, color } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  categoryModel.create(req.user.userId, { name, icon, color });
  res.status(201).json({ categories: categoryModel.findByUser(req.user.userId) });
});

router.delete('/:id', auth, (req, res) => {
  const result = categoryModel.remove(req.user.userId, req.params.id);
  if (!result.changes) return res.status(400).json({ error: 'Cannot delete default category or not found' });
  res.json({ success: true });
});

router.post('/:id/subcategories', auth, (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  subcategoryModel.create(req.params.id, req.user.userId, name);
  res.status(201).json({ categories: categoryModel.findByUser(req.user.userId) });
});

router.delete('/subcategories/:id', auth, (req, res) => {
  subcategoryModel.remove(req.user.userId, req.params.id);
  res.json({ success: true });
});

module.exports = router;
