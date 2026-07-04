const router = require('express').Router();
const auth   = require('../middleware/auth');
const ratesService = require('../services/ratesService');

router.get('/', auth, async (req, res) => {
  try {
    res.json(await ratesService.getRates(req.query.base));
  } catch (err) {
    if (err.message === 'Invalid base currency') {
      return res.status(400).json({ error: err.message });
    }
    res.status(502).json({ error: 'Exchange rates unavailable', detail: err.message });
  }
});

module.exports = router;
