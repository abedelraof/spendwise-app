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
    <div className="flex flex-col h-full bg-brand-gradient dark:bg-slate-900 dark:border-r dark:border-slate-800">
      {/* Logo */}
      <div className="px-5 py-5 flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-white/15 dark:bg-brand-600 flex items-center justify-center shadow-glow shrink-0">
          <Wallet size={16} className="text-white" />
        </div>
        <span className="font-bold text-white text-[17px] tracking-tight">SpendWise</span>
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
                  ? 'bg-white/15 text-white dark:bg-brand-900/60 dark:text-brand-300'
                  : 'text-white/60 hover:bg-white/10 hover:text-white dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span className={`p-1.5 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-white/20 text-white dark:bg-brand-800/60 dark:text-brand-400'
                    : 'text-white/50 group-hover:text-white dark:text-slate-500 dark:group-hover:text-slate-300'
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
      <div className="px-3 pb-4 pt-3 border-t border-white/10 dark:border-slate-800 space-y-1">
        <div className="flex items-center gap-3 px-3 py-2 rounded-xl">
          <div className="w-7 h-7 rounded-full bg-white/20 dark:bg-brand-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
            {initials}
          </div>
          <span className="text-xs text-white/50 dark:text-slate-400 truncate flex-1">{user?.email}</span>
        </div>
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-red-300 dark:text-red-400 hover:bg-white/10 dark:hover:bg-red-900/20 hover:text-red-200 dark:hover:text-red-300 transition-colors"
        >
          <span className="p-1.5"><LogOut size={14} /></span>
          Logout
        </button>
      </div>
    </div>
  );
}
