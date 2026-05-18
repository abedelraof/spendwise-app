import { Link } from 'react-router-dom';
import { Trash2, ArrowRight, CreditCard } from 'lucide-react';
import EmptyState from '../common/EmptyState';

export default function LatestTransactions({ expenses, onDelete }) {
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-slate-700/60">
        <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Latest Transactions</h3>
        <Link
          to="/transactions"
          className="flex items-center gap-1 text-xs font-medium text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 transition-colors"
        >
          View all <ArrowRight size={12} />
        </Link>
      </div>

      {!expenses?.length ? (
        <EmptyState icon={<CreditCard size={32} className="text-gray-300 dark:text-slate-600" />} title="No transactions yet" description="Add your first expense above" />
      ) : (
        <div className="divide-y divide-gray-50 dark:divide-slate-700/50">
          {expenses.map(e => (
            <div key={e.id} className="group flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-slate-700/30 transition-colors">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0"
                style={{ backgroundColor: (e.category_color || '#8b5cf6') + '22' }}
              >
                {e.category_icon || '📦'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{e.description || e.category_name}</p>
                <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
                  {e.date} · {e.category_name}{e.subcategory_name ? ` › ${e.subcategory_name}` : ''}
                </p>
                {e.tags && (
                  <p className="text-xs text-brand-500 dark:text-brand-400 mt-0.5">
                    {e.tags.split(',').map(t => `#${t.trim()}`).join(' ')}
                  </p>
                )}
              </div>
              <div className="text-right shrink-0 ml-2">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  {e.amount.toLocaleString()} <span className="text-xs font-normal text-gray-400">{e.currency}</span>
                </p>
                {e.is_recurring ? <span className="text-xs text-sky-500">recurring</span> : null}
              </div>
              <button
                onClick={() => onDelete(e.id)}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-red-500 dark:text-slate-600 dark:hover:text-red-400 ml-1 p-1"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
