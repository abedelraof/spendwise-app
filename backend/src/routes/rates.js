const router = require('express').Router();
const auth   = require('../middleware/auth');

const cache = {}; // { [base]: { data, fetchedAt } }
const TTL   = 3_600_000; // 1 hour

router.get('/', auth, async (req, res) => {
  const base = (req.query.base || 'EGP').toUpperCase();
  if (!/^[A-Z]{2,4}$/.test(base)) {
    return res.status(400).json({ error: 'Invalid base currency' });
  }

  if (cache[base] && Date.now() - cache[base].fetchedAt < TTL) {
    return res.json({
      base,
      rates:     cache[base].data.rates,
      cached:    true,
      fetchedAt: cache[base].fetchedAt,
    });
  }

  try {
    const resp = await fetch(`https://open.er-api.com/v6/latest/${base}`);
    if (!resp.ok) throw new Error(`Upstream ${resp.status}`);
    const json = await resp.json();
    if (json.result !== 'success') throw new Error(json['error-type'] || 'API error');
    cache[base] = { data: json, fetchedAt: Date.now() };
    res.json({ base, rates: json.rates, cached: false, fetchedAt: cache[base].fetchedAt });
  } catch (err) {
    res.status(502).json({ error: 'Exchange rates unavailable', detail: err.message });
  }
});

module.exports = router;
