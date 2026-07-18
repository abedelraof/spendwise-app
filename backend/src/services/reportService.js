// Assembles the /report card: pulls every figure from the existing services
// (no new queries), normalises it into a flat shape for reportTemplate, and
// optionally rasterises the result via renderService.

const { getDashboardStats, getRangeStats, getCategoryBreakdown, getSpendingTrend } = require('./expenseService');
const budgetService = require('./budgetService');
const accountService = require('./accountService');
const { renderReportHtml } = require('./reportTemplate');
const { renderHtmlToPng } = require('./renderService');
const { todayISO } = require('../utils/dateUtils');

const MAX_CATEGORY_ROWS = 8;
const MAX_BUDGET_ROWS = 6;

// Same 80% / 100% thresholds the bot's text formatters use, so the image and
// /budgets can never disagree about whether something is over.
function budgetState(pct) {
  return pct >= 100 ? 'over' : pct >= 80 ? 'warn' : 'ok';
}

function fmt(n) {
  return Number(n ?? 0).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// getSpendingTrend omits days with no spending, and node-pg hands back `date` as
// a JS Date rather than a string — so key the lookup off an ISO slice, then walk
// the range on a UTC cursor (a local-time cursor drifts a day across DST).
function zeroFillTrend(rows, startISO, endISO) {
  const byDate = new Map();
  for (const r of rows) {
    const key = r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date).slice(0, 10);
    byDate.set(key, Number(r.total) || 0);
  }

  const points = [];
  const cursor = new Date(`${startISO}T00:00:00Z`);
  const last = new Date(`${endISO}T00:00:00Z`);

  // Guard against a malformed range producing an unbounded loop.
  let guard = 0;
  while (cursor <= last && guard++ < 400) {
    const key = cursor.toISOString().slice(0, 10);
    points.push({ date: key, total: byDate.get(key) || 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return points;
}

function buildKpis(period, currency, dashboard, range) {
  const spent = period.isMonth ? dashboard.totalThisMonth : range.total;
  const count = period.isMonth ? dashboard.transactionCount : range.transactionCount;
  const avg = period.isMonth ? dashboard.dailyAverage : range.total / (period.days || 1);
  const topCategory = period.isMonth ? dashboard.topCategory : range.topCategory;

  const tiles = [
    { label: 'Spent', value: fmt(spent), unit: currency, meta: period.label },
  ];

  if (period.isMonth) {
    // Income is only available month-scoped, so it's a month-only tile —
    // showing a month figure on a /report week would be misleading.
    const cashFlow = dashboard.incomeThisMonth - dashboard.totalThisMonth;
    tiles.push({
      label: 'Income',
      value: fmt(dashboard.incomeThisMonth),
      unit: currency,
      meta: `Cash flow ${cashFlow >= 0 ? '+' : '-'}${fmt(Math.abs(cashFlow))}`,
    });
  } else {
    tiles.push({ label: 'Top category', value: topCategory ?? 'N/A', unit: '', meta: '' });
  }

  tiles.push({ label: 'Daily average', value: fmt(avg), unit: currency, meta: `over ${period.days} day${period.days === 1 ? '' : 's'}` });
  tiles.push({ label: 'Transactions', value: String(count), unit: '', meta: period.isMonth && topCategory ? `Top: ${topCategory}` : '' });

  return tiles;
}

function buildCategories(breakdown) {
  if (!breakdown.length) return { rows: [], hiddenCount: 0 };

  const head = breakdown.slice(0, MAX_CATEGORY_ROWS);
  const tail = breakdown.slice(MAX_CATEGORY_ROWS);

  const rows = head.map(b => ({
    name: b.category ?? 'Uncategorized',
    amount: Number(b.total) || 0,
    percentage: b.percentage,
    color: b.color || null,
  }));

  if (tail.length) {
    rows.push({
      name: `Other (${tail.length} categories)`,
      amount: tail.reduce((s, b) => s + (Number(b.total) || 0), 0),
      percentage: tail.reduce((s, b) => s + (b.percentage || 0), 0),
      color: null,
      isOther: true,
    });
  }

  // Bar length is relative to the largest row so the chart fills its width; the
  // printed percentage stays share-of-total to match the /stats text.
  const max = Math.max(...rows.map(r => r.amount), 0);
  for (const r of rows) r.barPct = max > 0 ? Math.round((r.amount / max) * 100) : 0;

  return { rows, hiddenCount: tail.length };
}

function buildBudgets(period, dashboard, budgetRows, capInfo) {
  const cap = capInfo?.cap != null
    ? (() => {
        const capValue = Number(capInfo.cap) || 0;
        const spent = dashboard.totalThisMonth;
        const pct = capValue > 0 ? Math.round((spent / capValue) * 100) : 0;
        return {
          cap: capValue,
          spent,
          pct,
          state: budgetState(pct),
          remaining: capValue - spent,
          // Distinct from `spent`: this is the sum of budget *limits*, i.e. a
          // planning figure, not money actually spent. Labelled separately.
          allocated: Number(capInfo.allocated) || 0,
        };
      })()
    : null;

  const rows = budgetRows
    .map(b => {
      // budgets.amount is NUMERIC and this query doesn't cast it, so it arrives
      // as a string — coerce before any arithmetic.
      const limit = parseFloat(b.amount) || 0;
      const pct = limit > 0 ? Math.round((b.spent / limit) * 100) : 0;
      return { name: b.category_name, spent: b.spent, limit, pct, state: budgetState(pct) };
    })
    .sort((a, b) => b.pct - a.pct)
    .slice(0, MAX_BUDGET_ROWS);

  const monthLabel = new Date(`${dashboard.month}-01T00:00:00Z`)
    .toLocaleString('en', { month: 'long', timeZone: 'UTC' });

  return {
    monthLabel,
    // Budgets and net worth have no range-scoped query — say so rather than
    // letting a /report today imply these are today's numbers.
    note: period.isMonth ? null : 'Budgets and net worth are always month-to-date.',
    cap,
    rows,
  };
}

async function buildReportData(user, period) {
  const currency = user.currency;
  // Matches what /networth uses, so the two surfaces agree.
  const homeCurrency = user.accounts_currency || user.currency;

  // A month range ends on the last day of the month, which is in the future for
  // most of the month. Fine for aggregates, but it would pad the trend chart
  // with weeks of zeros — so clamp the chart's range to today.
  const trendEnd = period.isMonth && period.end > todayISO() ? todayISO() : period.end;

  const [range, dashboard, breakdown, trendRows, budgetRows, capInfo, netWorth] = await Promise.all([
    period.isMonth ? null : getRangeStats(user.id, period.start, period.end),
    getDashboardStats(user.id),
    getCategoryBreakdown(user.id, period.start, period.end),
    getSpendingTrend(user.id, period.start, trendEnd),
    budgetService.getBudgetsWithSpending(user.id),
    budgetService.getMonthlyCapInfo(user.id),
    accountService.getNetWorth(user.id, homeCurrency),
  ]);

  const points = zeroFillTrend(trendRows, period.start, trendEnd);
  const trendMax = Math.max(...points.map(p => p.total), 0);

  return {
    period,
    currency,
    generatedAt: todayISO(),
    kpis: buildKpis(period, currency, dashboard, range),
    categories: buildCategories(breakdown),
    trend: { points, max: trendMax, empty: trendMax <= 0 },
    budgets: buildBudgets(period, dashboard, budgetRows, capInfo),
    netWorth,
  };
}

async function generateReportPng(user, period) {
  const data = await buildReportData(user, period);
  return renderHtmlToPng(renderReportHtml(data));
}

module.exports = { buildReportData, generateReportPng };
