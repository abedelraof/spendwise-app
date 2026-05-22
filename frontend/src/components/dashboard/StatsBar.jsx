import { TrendingDown, Tag, CalendarDays, Receipt } from 'lucide-react';
import StatCard from './StatCard';

function fmt(n, currency = 'EGP') {
  if (n === null || n === undefined) return '—';
  return `${Number(n).toLocaleString('en', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ${currency}`;
}

export default function StatsBar({ stats, currency }) {
  if (!stats) return null;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard icon={TrendingDown} label="Spent This Month" value={fmt(stats.totalThisMonth, currency)} sub={stats.month} color="brand" />
      <StatCard icon={Tag}          label="Top Category"     value={stats.topCategory || '—'}              color="emerald" />
      <StatCard icon={CalendarDays} label="Daily Average"    value={fmt(stats.dailyAverage, currency)}      color="amber" />
      <StatCard icon={Receipt}      label="Transactions"     value={stats.transactionCount ?? '—'}          color="sky" />
    </div>
  );
}
