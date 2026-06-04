import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Trash2, ShieldCheck, Bot, CreditCard, TrendingUp, Wallet, Target } from 'lucide-react';
import useApi from '../hooks/useApi';
import useAuth from '../hooks/useAuth';
import { getAdminUser, deleteAdminUser } from '../api/adminApi';
import Spinner from '../components/common/Spinner';
import Modal from '../components/common/Modal';
import { showToast } from '../components/common/Toast';

function StatCard({ icon: Icon, label, value, sub }) {
  return (
    <div className="card p-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-xl bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center text-brand-600 dark:text-brand-400 shrink-0">
        <Icon size={16} />
      </div>
      <div>
        <p className="text-xs text-gray-400 dark:text-slate-500">{label}</p>
        <p className="text-lg font-bold text-gray-900 dark:text-white">{value}</p>
        {sub && <p className="text-xs text-gray-400 dark:text-slate-500">{sub}</p>}
      </div>
    </div>
  );
}

export default function AdminUserDetail() {
  const { id }    = useParams();
  const api       = useApi();
  const { user: me } = useAuth();
  const navigate  = useNavigate();
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!me?.is_admin) { navigate('/app'); return; }
    getAdminUser(api, id)
      .then(setData)
      .catch(() => showToast('Failed to load user', 'error'))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteAdminUser(api, id);
      showToast('User deleted');
      navigate('/app/admin/users');
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to delete', 'error');
      setDeleting(false);
    }
  }

  if (loading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;
  if (!data)   return null;

  const fmt = (n) => Number(n).toLocaleString();

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/app/admin/users')} className="btn-ghost p-2">
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">{data.email}</h1>
          <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
            Joined {new Date(data.created_at).toLocaleDateString()}
          </p>
        </div>
        {me?.id !== data.id && (
          <button onClick={() => setShowDelete(true)} className="btn-danger">
            <Trash2 size={13} /> Delete User
          </button>
        )}
      </div>

      {/* Info card */}
      <div className="card p-5 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
        <div>
          <p className="text-xs text-gray-400 dark:text-slate-500 mb-1">Currency</p>
          <p className="font-medium text-gray-900 dark:text-white">{data.currency}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400 dark:text-slate-500 mb-1">Theme</p>
          <p className="font-medium text-gray-900 dark:text-white capitalize">{data.theme}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400 dark:text-slate-500 mb-1">Role</p>
          {data.is_admin === 1
            ? <span className="inline-flex items-center gap-1 text-brand-600 dark:text-brand-400 font-medium"><ShieldCheck size={13} /> Admin</span>
            : <span className="text-gray-500 dark:text-slate-400">User</span>
          }
        </div>
        <div>
          <p className="text-xs text-gray-400 dark:text-slate-500 mb-1">Claude AI</p>
          {data.has_api_key
            ? <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium"><Bot size={13} /> Key saved</span>
            : <span className="text-gray-400 dark:text-slate-500">No key</span>
          }
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={CreditCard} label="Expenses"    value={fmt(data.stats.expense_count)}  sub={`${fmt(data.stats.total_spent)} ${data.currency}`} />
        <StatCard icon={TrendingUp} label="Income"      value={fmt(data.stats.income_count)}   sub={`${fmt(data.stats.total_income)} ${data.currency}`} />
        <StatCard icon={Wallet}     label="Accounts"    value={data.stats.account_count} />
        <StatCard icon={Target}     label="Goals"       value={data.stats.goal_count} />
      </div>

      {/* Recent expenses */}
      {data.recent_expenses?.length > 0 && (
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Recent Expenses</h2>
          <div className="space-y-2">
            {data.recent_expenses.map((e, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 dark:border-slate-700/40 last:border-0">
                <div>
                  <p className="text-sm text-gray-800 dark:text-slate-200">{e.description || '—'}</p>
                  <p className="text-xs text-gray-400 dark:text-slate-500">{e.category} · {e.date}</p>
                </div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  {Number(e.amount).toLocaleString()} {e.currency}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Delete modal */}
      {showDelete && (
        <Modal open onClose={() => setShowDelete(false)} title="Delete User" size="sm">
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-slate-300">
              Permanently delete <strong>{data.email}</strong> and all their data? This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowDelete(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={handleDelete} disabled={deleting} className="btn-danger flex-1">
                {deleting ? <><Spinner size="sm" /> Deleting…</> : <><Trash2 size={13} /> Delete</>}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
