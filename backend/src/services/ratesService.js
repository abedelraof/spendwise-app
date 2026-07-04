const cache = {}; // { [base]: { data, fetchedAt } }
const TTL   = 3_600_000; // 1 hour

async function getRates(base) {
  const normalized = String(base || 'EGP').toUpperCase();
  if (!/^[A-Z]{2,4}$/.test(normalized)) {
    throw new Error('Invalid base currency');
  }

  if (cache[normalized] && Date.now() - cache[normalized].fetchedAt < TTL) {
    return {
      base:      normalized,
      rates:     cache[normalized].data.rates,
      cached:    true,
      fetchedAt: cache[normalized].fetchedAt,
    };
  }

  const resp = await fetch(`https://open.er-api.com/v6/latest/${normalized}`);
  if (!resp.ok) throw new Error(`Upstream ${resp.status}`);
  const json = await resp.json();
  if (json.result !== 'success') throw new Error(json['error-type'] || 'API error');

  cache[normalized] = { data: json, fetchedAt: Date.now() };
  return { base: normalized, rates: json.rates, cached: false, fetchedAt: cache[normalized].fetchedAt };
}

module.exports = { getRates };
