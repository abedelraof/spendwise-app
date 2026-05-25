import { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, PieChart, Pie, CartesianGrid,
} from 'recharts';
import { Download, BarChart2 } from 'lucide-react';
import useApi from '../hooks/useApi';
import useAuth from '../hooks/useAuth';
import { getSpendingTrend, getCategoryBreakdown, getTopDays, exportCsv, getDashboardStats } from '../api/reportsApi';
import { showToast } from '../components/common/Toast';
import Spinner from '../components/common/Spinner';
import EmptyState from '../components/common/EmptyState';
import StatsBar from '../components/dashboard/StatsBar';
import MonthlyInsight from '../components/dashboard/MonthlyInsight';

function monthStart() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`; }
function today() { return new Date().toISOString().split('T')[0]; }

const PRESETS = [
  { id: 'month', label: 'This Month' },
  { id: 'last',  label: 'Last Month' },
  { id: '3m',    label: '3 Months'   },
  { id: 'year',  label: 'This Year'  },
  { id: 'custom',label: 'Custom'     },
];
function presetDates(id) {
  const d = new Date(), y = d.getFullYear(), m = d.getMonth();
  const iso = x => x.toISOString().split('T')[0];
  if (id === 'month') return { s: iso(new Date(y, m, 1)),   e: iso(new Date(y, m+1, 0)) };
  if (id === 'last')  return { s: iso(new Date(y, m-1, 1)), e: iso(new Date(y, m, 0))   };
  if (id === '3m')    return { s: iso(new Date(y, m-2, 1)), e: iso(new Date(y, m+1, 0)) };
  if (id === 'year')  return { s: iso(new Date(y, 0, 1)),   e: iso(new Date(y, 11, 31)) };
  return null;
}

const COLORS = ['#7c3aed','#f97316','#3b82f6','#10b981','#f59e0b','#ec4899','#6366f1','#14b8a6','#6b7280'];

function fmt(n) { return Number(n || 0).toLocaleString('en', { maximumFractionDigits: 0 }); }

function buildWeeklyTotals(trend) {
  const map = {};
  for (const { date, total } of (trend || [])) {
    const d = new Date(date + 'T00:00:00');
    // ISO week start = Monday
    const day = d.getDay(); // 0=Sun
    const diff = (day === 0 ? -6 : 1) - day;
    const mon = new Date(d); mon.setDate(d.getDate() + diff);
    const key = mon.toISOString().split('T')[0];
    map[key] = (map[key] || 0) + total;
  }
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, total]) => ({ week: 'W ' + week.slice(5), total }));
}

function buildDailyRows(startDate, endDate, trend) {
  const map = Object.fromEntries((trend || []).map(r => [r.date, r.total]));
  const rows = [];
  const cur = new Date(startDate);
  const end = new Date(endDate);
  while (cur <= end) {
    const d = cur.toISOString().split('T')[0];
    rows.push({ date: d, total: map[d] || 0 });
    cur.setDate(cur.getDate() + 1);
  }
  return rows;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function ChartCard({ title, children }) {
  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">{title}</h3>
      {children}
    </div>
  );
}

const tooltipStyle = {
  contentStyle: { background: '#1e1b4b', border: '1px solid #4c1d95', borderRadius: 10, color: '#e0d7ff', fontSize: 12 },
  itemStyle: { color: '#c4b5fd' },
  labelStyle: { color: '#a78bfa', fontWeight: 600 },
};

export default function Reports() {
  const api = useApi();
  const { user } = useAuth();
  const [datePreset, setDatePreset] = useState('month');
  const [startDate, setStartDate] = useState(monthStart());
  const [endDate, setEndDate]     = useState(today());
  const [data, setData]           = useState({ trend: [], breakdown: [], topDays: [] });
  const [loading, setLoading]     = useState(true);
  const [dashStats, setDashStats] = useState(null);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const [trend, breakdown, topDays, statsRes] = await Promise.all([
        getSpendingTrend(api, startDate, endDate),
        getCategoryBreakdown(api, startDate, endDate),
        getTopDays(api, startDate, endDate, 10),
        getDashboardStats(api).catch(() => null),
      ]);
      setData({ trend: trend.data, breakdown: breakdown.data, topDays: topDays.data });
      if (statsRes) setDashStats(statsRes);
    } catch { showToast('Failed to load reports', 'error'); }
    setLoading(false);
  }, [api, startDate, endDate]);

useEffect(() => { fetchReports(); }, [fetchReports]);

  async function handleExport() {
    try {
      const blob = await exportCsv(api, { startDate, endDate });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `expenses-${startDate}-${endDate}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch { showToast('Export failed', 'error'); }
  }

  const totalSpent  = data.breakdown.reduce((s, r) => s + r.total, 0);
  const currency    = user?.currency || 'EGP';
  const dailyRows   = buildDailyRows(startDate, endDate, data.trend);
  const dailyMax    = Math.max(...dailyRows.map(r => r.total), 1);
  const weeklyTotals = buildWeeklyTotals(data.trend);

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <BarChart2 size={20} className="text-brand-500" /> Reports
        </h2>
      </div>

      {/* Stats bar — this month's summary */}
      <StatsBar stats={dashStats} currency={currency} />

      {/* Monthly AI Insight */}
      <MonthlyInsight />

      {/* Filter bar */}
      <div className="card px-3 py-2.5 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-0.5 p-0.5 bg-gray-100 dark:bg-slate-700/60 rounded-lg shrink-0">
            {PRESETS.map(p => (
              <button key={p.id} onClick={() => {
                setDatePreset(p.id);
                const r = presetDates(p.id);
                if (r) { setStartDate(r.s); setEndDate(r.e); }
              }}
                className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                  datePreset === p.id
                    ? 'bg-white dark:bg-slate-800 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300'
                }`}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-3">
            {!loading && totalSpent > 0 && (
              <span className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums">
                {fmt(totalSpent)} <span className="text-xs font-normal text-gray-400">{currency}</span>
              </span>
            )}
            <button onClick={handleExport} className="btn-secondary !py-1.5 !px-2.5 !text-xs">
              <Download size={11} /> CSV
            </button>
          </div>
        </div>
        {datePreset === 'custom' && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-400 dark:text-slate-500">From</span>
            <input type="date" className="input !py-1.5 !text-xs w-36" value={startDate} onChange={e => setStartDate(e.target.value)} />
            <span className="text-xs text-gray-400 dark:text-slate-500">to</span>
            <input type="date" className="input !py-1.5 !text-xs w-36" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-14"><Spinner size="lg" /></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* Daily Spending Breakdown */}
          <div className="card p-5 lg:col-span-2">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
              Daily Spending
              <span className="ml-2 text-xs font-normal text-gray-400 dark:text-slate-500">{dailyRows.length} days</span>
            </h3>
            {!dailyRows.length ? (
              <EmptyState icon="📅" title="No data" description="Select a date range" />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-8 gap-y-1.5">
                {dailyRows.map(row => {
                  const dayLabel  = DAY_LABELS[new Date(row.date + 'T00:00:00').getDay()];
                  const isMax     = row.total > 0 && row.total === dailyMax;
                  const barPct    = (row.total / dailyMax) * 100;
                  const isZero    = row.total === 0;
                  return (
                    <div key={row.date} className={`flex items-center gap-2.5 py-1.5 px-2 rounded-lg transition-colors ${isMax ? 'bg-brand-50 dark:bg-brand-900/20' : ''}`}>
                      <span className="w-7 text-[10px] font-medium text-gray-400 dark:text-slate-500 shrink-0">{dayLabel}</span>
                      <span className={`w-20 text-xs shrink-0 ${isZero ? 'text-gray-300 dark:text-slate-600' : 'text-gray-600 dark:text-slate-400'}`}>{row.date.slice(5)}</span>
                      <div className="flex-1 bg-gray-100 dark:bg-slate-700/60 rounded-full h-1.5 overflow-hidden">
                        {!isZero && (
                          <div
                            className={`h-1.5 rounded-full transition-all duration-500 ${isMax ? 'bg-brand-500' : 'bg-brand-400/60 dark:bg-brand-500/50'}`}
                            style={{ width: `${barPct}%` }}
                          />
                        )}
                      </div>
                      <span className={`w-24 text-right text-xs font-semibold shrink-0 tabular-nums ${isZero ? 'text-gray-300 dark:text-slate-600' : isMax ? 'text-brand-600 dark:text-brand-400' : 'text-gray-700 dark:text-slate-300'}`}>
                        {isZero ? '—' : `${fmt(row.total)} ${currency}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Category Pie */}
          <ChartCard title="Category Breakdown">
            {!data.breakdown.length ? (
              <EmptyState icon="📊" title="No data" description="No expenses in this range" />
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={data.breakdown} dataKey="total" nameKey="category" cx="50%" cy="50%" outerRadius={90}
                    label={({ category, percentage }) => `${category} ${percentage}%`}
                    labelLine={{ stroke: '#9ca3af', strokeWidth: 0.5 }}
                  >
                    {data.breakdown.map((entry, i) => (
                      <Cell key={i} fill={entry.color || COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip {...tooltipStyle} formatter={(v) => [`${fmt(v)} ${currency}`, 'Amount']} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* Category Summary */}
          <ChartCard title="Category Summary">
            {!data.breakdown.length ? (
              <EmptyState icon="📊" title="No data" description="No expenses in this range" />
            ) : (
              <div className="space-y-3">
                {data.breakdown.map((cat, i) => (
                  <div key={cat.category || i}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: cat.color || COLORS[i % COLORS.length] }} />
                        <span className="text-gray-700 dark:text-slate-300 truncate font-medium">{cat.category || 'Uncategorized'}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className="text-gray-400 dark:text-slate-500 text-[11px]">{cat.percentage}%</span>
                        <span className="font-semibold text-gray-900 dark:text-white tabular-nums">{fmt(cat.total)} {currency}</span>
                      </div>
                    </div>
                    <div className="w-full bg-gray-100 dark:bg-slate-700/60 rounded-full h-1.5 overflow-hidden">
                      <div className="h-1.5 rounded-full transition-all duration-500"
                        style={{ width: `${cat.percentage}%`, backgroundColor: cat.color || COLORS[i % COLORS.length] }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ChartCard>

          {/* Spending Trend */}
          <div className="card p-5 lg:col-span-2">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Spending Trend</h3>
            {!data.trend.length ? (
              <EmptyState icon="📈" title="No data" description="No expenses in this range" />
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={data.trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={d => d.slice(5)} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => fmt(v)} />
                  <Tooltip {...tooltipStyle} formatter={(v) => [`${fmt(v)} ${currency}`, 'Spent']} />
                  <Line type="monotone" dataKey="total" stroke="#7c3aed" strokeWidth={2.5} dot={false} activeDot={{ r: 5, fill: '#7c3aed' }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Weekly Totals */}
          <ChartCard title="Weekly Spending">
            {!weeklyTotals.length ? (
              <EmptyState icon="📊" title="No data" description="No expenses in this range" />
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={weeklyTotals} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                  <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => fmt(v)} />
                  <Tooltip {...tooltipStyle} formatter={(v) => [`${fmt(v)} ${currency}`, 'Spent']} />
                  <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                    {weeklyTotals.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* Top Spending Days */}
          <ChartCard title="Top Spending Days">
            {!data.topDays.length ? (
              <EmptyState icon="📅" title="No data" />
            ) : (
              <div className="space-y-2.5">
                {data.topDays.map((d) => {
                  const max = data.topDays[0]?.total || 1;
                  return (
                    <div key={d.date}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-600 dark:text-slate-400">{d.date}</span>
                        <span className="font-semibold text-gray-900 dark:text-white">{fmt(d.total)} {currency}</span>
                      </div>
                      <div className="w-full bg-gray-100 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
                        <div className="h-1.5 rounded-full bg-brand-500 transition-all duration-500"
                          style={{ width: `${(d.total / max) * 100}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ChartCard>
        </div>
      )}

    </div>
  );
}
