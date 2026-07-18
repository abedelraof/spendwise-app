function todayISO() {
  return new Date().toISOString().split('T')[0];
}

function yesterdayISO() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

function getMonthRange(year, month) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const end = new Date(year, month, 0).toISOString().split('T')[0];
  return { start, end };
}

function addInterval(dateStr, interval) {
  const d = new Date(dateStr);
  if (interval === 'daily') d.setDate(d.getDate() + 1);
  else if (interval === 'weekly') d.setDate(d.getDate() + 7);
  else d.setMonth(d.getMonth() + 1);
  return d.toISOString().split('T')[0];
}

function currentYearMonth() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
}

// Resolves the [today|yesterday|week|month] argument shared by the bot's /stats
// and /report commands into a date range. Returns null for an unrecognised arg
// so callers can reply with a usage message.
//
// Note `days` for the month case is the day-of-month, not the month length —
// that's what getDashboardStats divides by for its dailyAverage, and matching it
// keeps /stats and /report agreeing.
function resolvePeriod(arg) {
  const key = (arg || '').trim().toLowerCase() || 'month';

  if (key === 'month') {
    const now = new Date();
    const { start, end } = getMonthRange(now.getFullYear(), now.getMonth() + 1);
    return { key: 'month', label: 'This Month', start, end, days: now.getDate(), isMonth: true };
  }

  if (key === 'today') {
    const d = todayISO();
    return { key: 'today', label: 'Today', start: d, end: d, days: 1, isMonth: false };
  }

  if (key === 'yesterday') {
    const d = yesterdayISO();
    return { key: 'yesterday', label: 'Yesterday', start: d, end: d, days: 1, isMonth: false };
  }

  if (key === 'week') {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 6);
    return {
      key: 'week',
      label: 'This Week',
      start: weekAgo.toISOString().slice(0, 10),
      end: todayISO(),
      days: 7,
      isMonth: false,
    };
  }

  return null;
}

module.exports = { todayISO, yesterdayISO, getMonthRange, addInterval, currentYearMonth, resolvePeriod };
