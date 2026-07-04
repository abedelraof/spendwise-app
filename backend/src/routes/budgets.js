const router = require('express').Router();
const auth = require('../middleware/auth');
const { queryOne } = require('../db/database');
const budgetService = require('../services/budgetService');

router.get('/', auth, async (req, res, next) => {
  try {
    res.json({ budgets: await budgetService.getBudgetsWithSpending(req.user.userId) });
  } catch (err) { next(err); }
});

router.get('/cap', auth, async (req, res, next) => {
  try {
    res.json(await budgetService.getMonthlyCapInfo(req.user.userId));
  } catch (err) { next(err); }
});

router.put('/cap', auth, async (req, res, next) => {
  try {
    const { amount } = req.body;
    const capAmount = amount === null || amount === undefined ? null : Number(amount);

    const { allocated } = await budgetService.getMonthlyCapInfo(req.user.userId);
    if (capAmount != null && capAmount < allocated) {
      return res.status(400).json({
        error: `Monthly budget can't be lower than your current allocated total (${allocated}). Reduce category budgets first.`,
      });
    }

    await budgetService.setMonthlyCap(req.user.userId, capAmount);
    res.json(await budgetService.getMonthlyCapInfo(req.user.userId));
  } catch (err) { next(err); }
});

router.post('/', auth, async (req, res, next) => {
  try {
    const { categoryId, amount, period = 'monthly' } = req.body;
    if (!categoryId || !amount) return res.status(400).json({ error: 'categoryId and amount required' });

    if (period === 'monthly') {
      const existing = await queryOne(
        'SELECT id FROM budgets WHERE user_id = $1 AND category_id = $2 AND period = $3',
        [req.user.userId, categoryId, period]
      );
      const { cap, allocated } = await budgetService.getMonthlyCapInfo(req.user.userId, existing?.id ?? null);
      if (cap != null && allocated + Number(amount) > cap) {
        return res.status(400).json({
          error: `This would exceed your monthly budget of ${cap}. ${Math.max(0, cap - allocated)} remaining.`,
        });
      }
    }

    await budgetService.createBudget(req.user.userId, { categoryId, amount, period });
    res.status(201).json({ budgets: await budgetService.getBudgetsWithSpending(req.user.userId) });
  } catch (err) { next(err); }
});

router.put('/:id', auth, async (req, res, next) => {
  try {
    const { amount } = req.body;

    const budget = await queryOne(
      'SELECT id, period FROM budgets WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.userId]
    );
    if (!budget) return res.status(404).json({ error: 'Not found' });

    if (budget.period === 'monthly') {
      const { cap, allocated } = await budgetService.getMonthlyCapInfo(req.user.userId, budget.id);
      if (cap != null && allocated + Number(amount) > cap) {
        return res.status(400).json({
          error: `This would exceed your monthly budget of ${cap}. ${Math.max(0, cap - allocated)} remaining.`,
        });
      }
    }

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
