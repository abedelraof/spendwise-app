import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, TrendingUp, CreditCard, Wallet, Bot, UserCheck } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import useApi from '../hooks/useApi';
import useAuth from '../hooks/useAuth';
import { getAdminStats } from '../api/adminApi';
import Spinner from '../components/common/Spinner';
import { showToast } from '../components/common/Toast';

function StatCard({ icon: Icon, label, value, sub, color = 'brand' }) {
  const colors = {
    brand:  'bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400',
    green:  'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400',
    blue:   'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
    purple: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400',
    amber:  'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400',
    rose:   'bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400',
  };
  return (
    <div className="card p-5 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${colors[color]}`}>
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-400 dark:text-slate-500">{label}</p>
        <p className="text-xl font-bold text-gray-900 dark:text-white">{value}</p>
        {sub && <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export default function Admin() {
  const api = useApi();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.is_admin) { navigate('/app'); return; }
    getAdminStats(api)
      .then(setStats)
      .catch(() => showToast('Failed to load stats', 'error'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;
  if (!stats)  return null;

  const fmt = (n) => Number(n).toLocaleString();

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Admin Overview</h1>
        <p className="text-sm text-gray-400 dark:text-slate-500 mt-0.5">Platform-wide statistics</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard icon={Users}     label="Total Users"          value={fmt(stats.total_users)}          sub={`+${stats.new_users_this_month} this month`} color="brand"  />
        <StatCard icon={UserCheck} label="Active (30d)"         value={fmt(stats.active_users_30d)}     sub="had activity"                               color="green"  />
        <StatCard icon={CreditCard}label="Total Expenses"       value={fmt(stats.total_expenses)}       sub={`${fmt(stats.total_expense_amount)} EGP`}   color="rose"   />
        <StatCard icon={TrendingUp}label="Total Income Records" value={fmt(stats.total_income_records)} sub={`${fmt(stats.total_income_amount)} EGP`}    color="blue"   />
        <StatCard icon={Wallet}    label="Total Accounts"       value={fmt(stats.total_accounts)}       color="purple" />
        <StatCard icon={Bot}       label="AI Key Users"         value={fmt(stats.users_with_api_key)}   sub="have Claude API key"                        color="amber"  />
      </div>

      {/* Signups chart */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">New Signups — Last 6 Months</h2>
        {stats.signups_by_month.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-slate-500 text-center py-8">No data yet</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={stats.signups_by_month} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
                formatter={(v) => [v, 'Signups']}
              />
              <Bar dataKey="count" fill="var(--color-brand-500, #6366f1)" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Quick link */}
      <div className="card p-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-white">Manage Users</p>
          <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">View all users, their data and stats</p>
        </div>
        <button onClick={() => navigate('/app/admin/users')} className="btn-primary shrink-0">
          View Users
        </button>
      </div>
    </div>
  );
}
