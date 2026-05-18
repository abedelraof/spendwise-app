import { useState, useEffect, useCallback } from 'react';
import { Trash2, Pencil, Filter, TrendingUp, Plus } from 'lucide-react';
import useApi from '../hooks/useApi';
import useAuth from '../hooks/useAuth';
import Modal from '../components/common/Modal';
import Spinner from '../components/common/Spinner';
import EmptyState from '../components/common/EmptyState';
import { showToast } from '../components/common/Toast';
import { getIncomes, createIncomes, updateIncome, deleteIncome } from '../api/incomeApi';

const PAGE_SIZE = 20;
const SOURCES   = ['Salary', 'Business', 'Freelance', 'Investment', 'Rental', 'Gift', 'Other'];
const CURRENCIES = ['EGP', 'USD', 'EUR', 'GBP', 'SAR', 'AED', 'CAD', 'JPY', 'CHF', 'CNY'];

const SOURCE_COLORS = {
  Salary:     'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  Business:   'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  Freelance:  'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  Investment: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  Rental:     'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  Gift:       'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300',
  Other:      'bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-slate-300',
};

const todayStr    = () => new Date().toISOString().split('T')[0];
const monthStart  = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`; };
const fmt         = (n) => Number(n ?? 0).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── Add / Edit modal ──────────────────────────────────────────────────────────
function IncomeModal({ income, defaultCurrency, onSave, onClose }) {
  const isEdit = !!income;
  const [amount,      setAmount]      = useState(String(income?.amount ?? ''));
  const [currency,    setCurrency]    = useState(income?.currency ?? defaultCurrency ?? 'EGP');
  const [date,        setDate]        = useState(income?.date ?? todayStr());
  const [source,      setSource]      = useState(income?.source ?? 'Salary');
  const [description, setDescription] = useState(income?.description ?? '');
  const [notes,       setNotes]       = useState(income?.notes ?? '');
  const [saving,      setSaving]      = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!amount || !date) return;
    setSaving(true);
    try {
      await onSave({
        amount: parseFloat(amount), currency, date, source,
        description: description.trim() || null,
        notes: notes.trim() || null,
      });
      onClose();
    } finally { setSaving(false); }
  }

  return (
    <Modal open onClose={onClose} title={isEdit ? 'Edit Income' : 'Add Income'} size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Amount *</label>
            <input type="number" step="0.01" min="0.01" className="input"
              value={amount} onChange={e => setAmount(e.target.value)} required autoFocus />
          </div>
          <div>
            <label className="label">Currency</label>
            <select className="input" value={currency} onChange={e => setCurrency(e.target.value)}>
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="label">Date *</label>
          <input type="date" className="input" value={date}
            onChange={e => setDate(e.target.value)} required />
        </div>
        <div>
          <label className="label">Source</label>
          <div className="grid grid-cols-3 gap-2">
            {SOURCES.map(s => (
              <button key={s} type="button" onClick={() => setSource(s)}
                className={`py-2 px-3 rounded-xl text-xs font-medium border transition-all ${
                  source === s
                    ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 ring-2 ring-brand-500/30'
                    : 'border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-gray-600 dark:text-slate-400 hover:border-gray-300 dark:hover:border-slate-600'
                }`}>
                {s}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="label">Description</label>
          <input className="input" placeholder="e.g. Monthly salary, Client payment"
            value={description} onChange={e => setDescription(e.target.value)} />
        </div>
        <div>
          <label className="label">Notes (optional)</label>
          <input className="input" value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button type="submit" disabled={saving || !amount || !date} className="btn-primary flex-1">
            {isEdit ? 'Save Changes' : 'Add Income'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Income() {
  const api = useApi();
  const { user } = useAuth();

  const [filters, setFilters] = useState({
    startDate: monthStart(), endDate: todayStr(),
    source: '', search: '',
  });
  const [page,       setPage]       = useState(0);
  const [incomes,    setIncomes]    = useState([]);
  const [total,      setTotal]      = useState(0);
  const [loading,    setLoading]    = useState(true);
  const [showAdd,    setShowAdd]    = useState(false);
  const [editTarget, setEditTarget] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getIncomes(api, {
        ...filters,
        source: filters.source || undefined,
        search: filters.search || undefined,
        limit: PAGE_SIZE, offset: page * PAGE_SIZE,
      });
      setIncomes(data.incomes);
      setTotal(data.total);
    } catch { showToast('Failed to load income records', 'error'); }
    setLoading(false);
  }, [api, filters, page]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const applyFilter = (k, v) => { setFilters(f => ({ ...f, [k]: v })); setPage(0); };
  const clearFilters = () => {
    setFilters({ startDate: monthStart(), endDate: todayStr(), source: '', search: '' });
    setPage(0);
  };

  async function handleCreate(data) {
    try {
      await createIncomes(api, [data]);
      fetchData();
      showToast('Income added');
    } catch { showToast('Failed to add income', 'error'); }
  }

  async function handleUpdate(data) {
    try {
      await updateIncome(api, editTarget.id, data);
      setEditTarget(null);
      fetchData();
      showToast('Income updated');
    } catch { showToast('Failed to update income', 'error'); }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this income record?')) return;
    try { await deleteIncome(api, id); fetchData(); showToast('Deleted'); }
    catch { showToast('Failed to delete', 'error'); }
  }

  const totalPages      = Math.ceil(total / PAGE_SIZE);
  const periodTotal     = incomes.reduce((s, i) => s + i.amount * i.exchange_rate, 0);

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <TrendingUp size={20} className="text-emerald-500" /> Income
            </h2>
            {!loading && incomes.length > 0 && (
              <span className="text-sm text-gray-400 dark:text-slate-500">
                {fmt(periodTotal)} <span className="text-xs">{user?.currency}</span>
                <span className="ml-2 text-xs">· {total} records</span>
              </span>
            )}
          </div>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary">
          <Plus size={14} /> Add Income
        </button>
      </div>

      {/* Filters */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Filter size={14} className="text-gray-400" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Filters</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div>
            <label className="label">From</label>
            <input type="date" className="input" value={filters.startDate}
              onChange={e => applyFilter('startDate', e.target.value)} />
          </div>
          <div>
            <label className="label">To</label>
            <input type="date" className="input" value={filters.endDate}
              onChange={e => applyFilter('endDate', e.target.value)} />
          </div>
          <div>
            <label className="label">Source</label>
            <select className="input" value={filters.source}
              onChange={e => applyFilter('source', e.target.value)}>
              <option value="">All sources</option>
              {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Search</label>
            <input className="input" placeholder="description, notes…"
              value={filters.search} onChange={e => applyFilter('search', e.target.value)} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={clearFilters} className="btn-secondary text-xs py-1.5 px-3">Clear filters</button>
          <span className="text-xs text-gray-400 dark:text-slate-500 ml-auto">{total} records</span>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-14"><Spinner size="lg" /></div>
        ) : !incomes.length ? (
          <EmptyState icon="📈" title="No income records found"
            description="Try adjusting your filters or add an income record" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-slate-700/40 border-b border-gray-100 dark:border-slate-700">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Description</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider hidden sm:table-cell">Source</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Amount</th>
                  <th className="px-4 py-3 w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-slate-700/50">
                {incomes.map(inc => (
                  <tr key={inc.id} className="group hover:bg-gray-50 dark:hover:bg-slate-700/30 transition-colors">
                    <td className="px-4 py-3 text-gray-500 dark:text-slate-400 whitespace-nowrap text-xs">{inc.date}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 dark:text-white truncate max-w-xs">
                        {inc.description || inc.source}
                      </div>
                      {inc.notes && (
                        <div className="text-xs text-gray-400 dark:text-slate-500 mt-0.5 truncate max-w-xs">{inc.notes}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${SOURCE_COLORS[inc.source] ?? SOURCE_COLORS.Other}`}>
                        {inc.source}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                      +{fmt(inc.amount)} <span className="text-xs font-normal text-gray-400">{inc.currency}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => setEditTarget(inc)}
                          className="p-1.5 text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20 rounded-lg transition-colors">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => handleDelete(inc.id)}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3.5 border-t border-gray-100 dark:border-slate-700">
            <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
              className="btn-secondary text-xs py-1.5 px-3 disabled:opacity-40">← Prev</button>
            <span className="text-xs text-gray-500 dark:text-slate-400">Page {page + 1} of {totalPages}</span>
            <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}
              className="btn-secondary text-xs py-1.5 px-3 disabled:opacity-40">Next →</button>
          </div>
        )}
      </div>

      {showAdd && (
        <IncomeModal defaultCurrency={user?.currency}
          onSave={handleCreate} onClose={() => setShowAdd(false)} />
      )}
      {editTarget && (
        <IncomeModal income={editTarget} defaultCurrency={user?.currency}
          onSave={handleUpdate} onClose={() => setEditTarget(null)} />
      )}
    </div>
  );
}
