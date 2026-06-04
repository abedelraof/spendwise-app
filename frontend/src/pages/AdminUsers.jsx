import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Trash2, ChevronRight, ShieldCheck, Bot } from 'lucide-react';
import useApi from '../hooks/useApi';
import useAuth from '../hooks/useAuth';
import { getAdminUsers, deleteAdminUser } from '../api/adminApi';
import Spinner from '../components/common/Spinner';
import Modal from '../components/common/Modal';
import { showToast } from '../components/common/Toast';

const PAGE_SIZE = 20;

function Badge({ children, color = 'gray' }) {
  const colors = {
    gray:   'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300',
    green:  'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
    brand:  'bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400',
    amber:  'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${colors[color]}`}>
      {children}
    </span>
  );
}

export default function AdminUsers() {
  const api = useApi();
  const { user } = useAuth();
  const navigate  = useNavigate();
  const [users, setUsers]       = useState([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(0);
  const [search, setSearch]     = useState('');
  const [loading, setLoading]   = useState(true);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async (p = 0, q = search) => {
    setLoading(true);
    try {
      const params = { limit: PAGE_SIZE, offset: p * PAGE_SIZE };
      if (q) params.search = q;
      const data = await getAdminUsers(api, params);
      setUsers(data.users);
      setTotal(data.total);
    } catch { showToast('Failed to load users', 'error'); }
    setLoading(false);
  }, [search]);

  useEffect(() => {
    if (!user?.is_admin) { navigate('/app'); return; }
    load(0);
  }, []);

  function handleSearch(e) {
    e.preventDefault();
    setPage(0);
    load(0, search);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteAdminUser(api, deleteTarget.id);
      showToast(`Deleted ${deleteTarget.email}`);
      setDeleteTarget(null);
      load(page);
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to delete user', 'error');
    }
    setDeleting(false);
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const fmt = (n) => Number(n).toLocaleString();

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Users</h1>
          <p className="text-sm text-gray-400 dark:text-slate-500 mt-0.5">{total} total users</p>
        </div>
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="input pl-8 w-56"
              placeholder="Search by email…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <button type="submit" className="btn-primary">Search</button>
        </form>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12"><Spinner size="lg" /></div>
        ) : users.length === 0 ? (
          <p className="text-center text-gray-400 dark:text-slate-500 py-12 text-sm">No users found</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-slate-700/60">
                  {['User', 'Joined', 'Expenses', 'Income', 'Accounts', 'Last Activity', 'Flags', ''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-400 dark:text-slate-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-slate-700/40">
                {users.map(u => (
                  <tr
                    key={u.id}
                    className="hover:bg-gray-50 dark:hover:bg-slate-700/30 cursor-pointer transition-colors"
                    onClick={() => navigate(`/app/admin/users/${u.id}`)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center text-brand-700 dark:text-brand-400 text-xs font-bold shrink-0">
                          {u.email.slice(0,2).toUpperCase()}
                        </div>
                        <span className="font-medium text-gray-900 dark:text-white truncate max-w-[180px]">{u.email}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-slate-400 whitespace-nowrap">
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-medium text-gray-900 dark:text-white">{fmt(u.expense_count)}</span>
                      <span className="text-gray-400 dark:text-slate-500 text-xs ml-1">{u.currency}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-medium text-gray-900 dark:text-white">{fmt(u.income_count)}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-slate-300">{u.account_count}</td>
                    <td className="px-4 py-3 text-gray-500 dark:text-slate-400 whitespace-nowrap">
                      {u.last_activity || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {u.is_admin === 1 && <Badge color="brand"><ShieldCheck size={10} /> Admin</Badge>}
                        {u.has_api_key   && <Badge color="amber"><Bot size={10} /> AI</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => navigate(`/app/admin/users/${u.id}`)}
                          className="p-1.5 text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                        >
                          <ChevronRight size={14} />
                        </button>
                        {u.id !== user?.id && (
                          <button
                            onClick={() => setDeleteTarget(u)}
                            className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-400 dark:text-slate-500">
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
          </p>
          <div className="flex gap-2">
            <button onClick={() => { setPage(p => p - 1); load(page - 1); }} disabled={page === 0} className="btn-secondary text-xs px-3 py-1.5">Prev</button>
            <button onClick={() => { setPage(p => p + 1); load(page + 1); }} disabled={page >= totalPages - 1} className="btn-secondary text-xs px-3 py-1.5">Next</button>
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {deleteTarget && (
        <Modal open onClose={() => setDeleteTarget(null)} title="Delete User" size="sm">
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-slate-300">
              Permanently delete <strong>{deleteTarget.email}</strong> and all their data? This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="btn-secondary flex-1">Cancel</button>
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
