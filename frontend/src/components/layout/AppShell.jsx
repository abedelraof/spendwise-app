import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Menu, Search } from 'lucide-react';
import Sidebar from './Sidebar';
import GlobalSearch from '../common/GlobalSearch';

const titles = {
  '/': 'Dashboard',
  '/transactions': 'Transactions',
  '/reports': 'Reports',
  '/recurring': 'Recurring',
  '/settings': 'Settings',
};

export default function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { pathname } = useLocation();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950 flex">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-60 fixed inset-y-0 left-0 z-30">
        <Sidebar />
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <aside className="relative w-64 h-full shadow-2xl animate-slide-up">
            <Sidebar onClose={() => setSidebarOpen(false)} />
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 lg:ml-60 flex flex-col min-h-screen">
        {/* Top bar */}
        <header className="sticky top-0 z-20 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-gray-100 dark:border-slate-800 px-4 lg:px-6 py-3.5 flex items-center gap-3">
          <button
            className="lg:hidden text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={20} />
          </button>
          <h1 className="flex-1 text-base font-semibold text-gray-900 dark:text-white">
            {titles[pathname] || 'ExpenseBeam'}
          </h1>
          <button
            className="hidden sm:flex items-center gap-2 px-3 py-1.5 text-xs text-gray-500 dark:text-slate-400 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
            onMouseDown={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))}
          >
            <Search size={12} />
            <span>Search</span>
            <kbd className="bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded px-1 text-[10px]">Ctrl+K</kbd>
          </button>
        </header>

        <main className="flex-1 p-3 md:p-5">
          <Outlet />
        </main>
      </div>

      <GlobalSearch />
    </div>
  );
}
