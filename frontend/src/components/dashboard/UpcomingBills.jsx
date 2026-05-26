import { CalendarClock } from 'lucide-react';
import { Link } from 'react-router-dom';

function daysBetween(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dateStr + 'T00:00:00');
  return Math.ceil((due - today) / (1000 * 60 * 60 * 24));
}

function DueBadge({ daysLeft }) {
  if (daysLeft <= 0) {
    return <span className="text-[11px] font-semibold bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-2 py-0.5 rounded-full">Today</span>;
  }
  if (daysLeft === 1) {
    return <span className="text-[11px] font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-full">Tomorrow</span>;
  }
  return <span className="text-[11px] font-medium bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400 px-2 py-0.5 rounded-full">in {daysLeft}d</span>;
}

export default function UpcomingBills({ bills }) {
  if (!bills?.length) return null;

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <CalendarClock size={15} className="text-brand-500" />
          Upcoming Bills
        </h3>
        <Link to="/app/recurring" className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline">
          View all
        </Link>
      </div>
      <div className="space-y-2.5">
        {bills.map(bill => {
          const daysLeft = daysBetween(bill.next_due_date);
          return (
            <div key={bill.id} className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center text-base shrink-0">
                {bill.category_icon || '📄'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {bill.description || bill.category || 'Recurring bill'}
                </p>
                <p className="text-xs text-gray-400 dark:text-slate-500">{bill.category || ''}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums">
                  {Number(bill.amount).toLocaleString('en', { maximumFractionDigits: 0 })} {bill.currency}
                </span>
                <DueBadge daysLeft={daysLeft} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
