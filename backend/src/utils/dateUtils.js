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

module.exports = { todayISO, yesterdayISO, getMonthRange, addInterval, currentYearMonth };
