const router = require('express').Router();
const auth = require('../middleware/auth');
const budgetService = require('../services/budgetService');

router.get('/', auth, async (req, res, next) => {
  try {
    res.json({ budgets: await budgetService.getBudgetsWithSpending(req.user.userId) });
  } catch (err) { next(err); }
});

router.post('/', auth, async (req, res, next) => {
  try {
    const { categoryId, amount, period } = req.body;
    if (!categoryId || !amount) return res.status(400).json({ error: 'categoryId and amount required' });
    await budgetService.createBudget(req.user.userId, { categoryId, amount, period });
    res.status(201).json({ budgets: await budgetService.getBudgetsWithSpending(req.user.userId) });
  } catch (err) { next(err); }
});

router.put('/:id', auth, async (req, res, next) => {
  try {
    const { amount } = req.body;
    await budgetService.updateBudget(req.params.id, req.user.userId, amount);
    res.json({ budgets: await budgetService.getBudgetsWithSpending(req.user.userId) });
  } catch (err) { next(err); }
});

router.delete('/:id', auth, async (req, res, next) => {
  try {
    await budgetService.removeBudget(req.params.id, req.user.userId);
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
