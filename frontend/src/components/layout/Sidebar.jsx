import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, ArrowLeftRight, BarChart2,
  RefreshCw, Settings, LogOut, Wallet, PiggyBank, TrendingUp,
} from 'lucide-react';
import useAuth from '../../hooks/useAuth';

const nav = [
  { to: '/app',                  icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/app/transactions',     icon: ArrowLeftRight,  label: 'Transactions' },
  { to: '/app/reports',          icon: BarChart2,        label: 'Reports' },
  { to: '/app/recurring',        icon: RefreshCw,        label: 'Recurring' },
  { to: '/app/accounts',         icon: PiggyBank,        label: 'Accounts' },
  { to: '/app/income',           icon: TrendingUp,       label: 'Income' },
  { to: '/app/settings',         icon: Settings,         label: 'Settings' },
];

export default function Sidebar({ onClose }) {
  const { user, logout } = useAuth();
  const initials = user?.email?.slice(0, 2).toUpperCase() ?? '??';

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900">
      {/* Logo */}
      <div className="px-5 py-5 flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-brand-gradient flex items-center justify-center shadow-glow shrink-0">
          <Wallet size={16} className="text-white" />
        </div>
        <span className="font-bold text-gray-900 dark:text-white text-[17px] tracking-tight">SpendWise</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 space-y-0.5 mt-1">
        {nav.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/app'}
            onClick={onClose}
            className={({ isActive }) =>
              `group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                isActive
                  ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300'
                  : 'text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-white'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span className={`p-1.5 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-brand-100 dark:bg-brand-800/50 text-brand-600 dark:text-brand-400'
                    : 'text-gray-400 dark:text-slate-500 group-hover:text-gray-600 dark:group-hover:text-slate-300'
                }`}>
                  <Icon size={15} strokeWidth={isActive ? 2.2 : 1.8} />
                </span>
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User + logout */}
      <div className="px-3 pb-4 pt-3 border-t border-gray-100 dark:border-slate-800 space-y-1">
        <div className="flex items-center gap-3 px-3 py-2 rounded-xl">
          <div className="w-7 h-7 rounded-full bg-brand-gradient flex items-center justify-center text-white text-xs font-bold shrink-0">
            {initials}
          </div>
          <span className="text-xs text-gray-500 dark:text-slate-400 truncate flex-1">{user?.email}</span>
        </div>
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
        >
          <span className="p-1.5"><LogOut size={14} /></span>
          Logout
        </button>
      </div>
    </div>
  );
}
