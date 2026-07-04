const { query } = require('../db/database');
const ratesService = require('./ratesService');

const LIST_SQL = `
  SELECT a.*,
    b.balance         AS latest_balance,
    b.recorded_date   AS latest_date,
    b.quantity        AS latest_quantity,
    b.price_per_unit  AS latest_price_per_unit
  FROM accounts a
  LEFT JOIN account_balances b ON b.id = (
    SELECT id FROM account_balances
    WHERE account_id = a.id
    ORDER BY recorded_date DESC, created_at DESC LIMIT 1
  )
  WHERE a.user_id = $1
  ORDER BY a.sort_order ASC, a.created_at ASC
`;

const getAccountsWithBalances = (userId) => query(LIST_SQL, [userId]);

async function getNetWorth(userId, homeCurrency) {
  const accounts = await getAccountsWithBalances(userId);

  let rates = null;
  try {
    rates = (await ratesService.getRates(homeCurrency)).rates;
  } catch {
    rates = null;
  }

  let totalAssets = 0;
  let totalLiabilities = 0;
  let unconverted = 0;

  for (const a of accounts) {
    if (a.latest_balance == null) continue;
    const bal = parseFloat(a.latest_balance);
    if (isNaN(bal)) continue;

    let converted;
    if (a.currency === homeCurrency) {
      converted = bal;
    } else {
      const rate = rates ? parseFloat(rates[a.currency]) : NaN;
      converted = (!isNaN(rate) && rate > 0) ? bal / rate : null;
    }

    if (converted == null) { unconverted++; continue; }
    if (a.type === 'liability') totalLiabilities += converted;
    else totalAssets += converted;
  }

  return {
    totalAssets,
    totalLiabilities,
    netWorth: totalAssets - totalLiabilities,
    homeCurrency,
    unconverted,
    accountCount: accounts.length,
  };
}

module.exports = { getAccountsWithBalances, getNetWorth };
