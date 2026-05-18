import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight } from 'lucide-react';

export default function BudgetAlerts({ budgets }) {
  const alerts = budgets?.filter(b => b.percentage >= 80) || [];
  if (!alerts.length) return null;

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2 text-sm">
          <AlertTriangle size={15} className="text-amber-500" />
          Budget Alerts
        </h3>
        <Link
          to="/settings"
          className="flex items-center gap-1 text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline"
        >
          Manage <ArrowRight size={11} />
        </Link>
      </div>
      <div className="space-y-3">
        {alerts.map(b => (
          <div key={b.id}>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="flex items-center gap-1.5 text-gray-700 dark:text-gray-300 font-medium">
                <span>{b.icon}</span> {b.category_name}
              </span>
              <span className={`font-semibold ${b.percentage >= 100 ? 'text-red-500' : 'text-amber-500'}`}>
                {b.percentage}% · {b.spent?.toLocaleString()} / {b.amount?.toLocaleString()}
              </span>
            </div>
            <div className="w-full bg-gray-100 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
              <div
                className={`h-1.5 rounded-full transition-all duration-500 ${b.percentage >= 100 ? 'bg-red-500' : 'bg-amber-400'}`}
                style={{ width: `${Math.min(b.percentage, 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
