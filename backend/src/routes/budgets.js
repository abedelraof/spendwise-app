const router = require('express').Router();
const auth = require('../middleware/auth');
const budgetService = require('../services/budgetService');

router.get('/', auth, (req, res) => {
  res.json({ budgets: budgetService.getBudgetsWithSpending(req.user.userId) });
});

router.post('/', auth, (req, res, next) => {
  try {
    const { categoryId, amount, period } = req.body;
    if (!categoryId || !amount) return res.status(400).json({ error: 'categoryId and amount required' });
    budgetService.createBudget(req.user.userId, { categoryId, amount, period });
    res.status(201).json({ budgets: budgetService.getBudgetsWithSpending(req.user.userId) });
  } catch (err) { next(err); }
});

router.put('/:id', auth, (req, res, next) => {
  try {
    const { amount } = req.body;
    budgetService.updateBudget(req.params.id, req.user.userId, amount);
    res.json({ budgets: budgetService.getBudgetsWithSpending(req.user.userId) });
  } catch (err) { next(err); }
});

router.delete('/:id', auth, (req, res) => {
  budgetService.removeBudget(req.params.id, req.user.userId);
  res.json({ success: true });
});

module.exports = router;
