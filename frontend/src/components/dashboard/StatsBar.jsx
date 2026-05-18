import { TrendingDown, Tag, CalendarDays, Receipt, TrendingUp, Landmark, ArrowUpDown } from 'lucide-react';
import StatCard from './StatCard';

function fmt(n, currency = 'EGP') {
  if (n === null || n === undefined) return '—';
  return `${Number(n).toLocaleString('en', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ${currency}`;
}

export default function StatsBar({ stats, currency, netWorthData }) {
  if (!stats) return null;

  const income    = stats.incomeThisMonth ?? null;
  const expenses  = stats.totalThisMonth  ?? null;
  const cashFlow  = income != null && expenses != null ? income - expenses : null;
  const netWorth  = netWorthData?.netWorth ?? null;
  const nwCur     = netWorthData?.currency ?? currency;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={TrendingDown} label="Spent This Month" value={fmt(stats.totalThisMonth, currency)} sub={stats.month} color="brand" />
        <StatCard icon={Tag}          label="Top Category"     value={stats.topCategory || '—'}              color="emerald" />
        <StatCard icon={CalendarDays} label="Daily Average"    value={fmt(stats.dailyAverage, currency)}      color="amber" />
        <StatCard icon={Receipt}      label="Transactions"     value={stats.transactionCount ?? '—'}          color="sky" />
      </div>
      {(income != null || netWorth != null) && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            icon={TrendingUp}
            label="Income This Month"
            value={fmt(income, currency)}
            sub={stats.month}
            color="emerald"
          />
          <StatCard
            icon={ArrowUpDown}
            label="Cash Flow"
            value={cashFlow != null ? (cashFlow >= 0 ? '+' : '') + fmt(cashFlow, currency) : '—'}
            sub={cashFlow != null ? (cashFlow >= 0 ? 'surplus' : 'deficit') : undefined}
            color={cashFlow == null ? 'sky' : cashFlow >= 0 ? 'emerald' : 'brand'}
          />
          <StatCard
            icon={Landmark}
            label="Net Worth"
            value={netWorth != null ? (netWorth >= 0 ? '' : '-') + fmt(Math.abs(netWorth), nwCur) : '—'}
            color={netWorth == null ? 'sky' : netWorth >= 0 ? 'emerald' : 'brand'}
          />
        </div>
      )}
    </div>
  );
}
