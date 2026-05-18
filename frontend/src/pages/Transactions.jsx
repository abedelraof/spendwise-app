import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, Trash2, Pencil, Filter, CreditCard } from 'lucide-react';
import useApi from '../hooks/useApi';
import useAuth from '../hooks/useAuth';
import { getExpenses, deleteExpense, bulkDeleteExpenses, updateExpense } from '../api/expensesApi';
import { getCategories } from '../api/categoriesApi';
import { exportCsv } from '../api/reportsApi';
import { showToast } from '../components/common/Toast';
import Spinner from '../components/common/Spinner';
import EmptyState from '../components/common/EmptyState';
import ParsedExpenseConfirm from '../components/dashboard/ParsedExpenseConfirm';

const PAGE_SIZE = 20;

function today() { return new Date().toISOString().split('T')[0]; }
function monthStart() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`; }

export default function Transactions() {
  const api = useApi();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();

  const [filters, setFilters] = useState({
    startDate: monthStart(), endDate: today(),
    search: searchParams.get('search') || '',
    categoryIds: [], subcategoryIds: [],
    minAmount: '', maxAmount: '',
    sortBy: 'date', sortDir: 'DESC',
  });
  const [page, setPage]           = useState(0);
  const [expenses, setExpenses]   = useState([]);
  const [total, setTotal]         = useState(0);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [selected, setSelected]   = useState(new Set());
  const [editingExpense, setEditingExpense] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        ...filters,
        categoryIds: filters.categoryIds.join(',') || undefined,
        subcategoryIds: filters.subcategoryIds.join(',') || undefined,
        limit: PAGE_SIZE, offset: page * PAGE_SIZE,
      };
      const data = await getExpenses(api, params);
      setExpenses(data.expenses);
      setTotal(data.total);
      setSelected(new Set());
    } catch { showToast('Failed to load transactions', 'error'); }
    setLoading(false);
  }, [api, filters, page]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { getCategories(api).then(d => setCategories(d.categories)).catch(() => {}); }, [api]);

  const applyFilter = (k, v) => { setFilters(f => ({ ...f, [k]: v })); setPage(0); };
  const clearFilters = () => { setFilters({ startDate: monthStart(), endDate: today(), search: '', categoryIds: [], subcategoryIds: [], minAmount: '', maxAmount: '', sortBy: 'date', sortDir: 'DESC' }); setPage(0); };

  async function handleDelete(id) {
    if (!confirm('Delete this expense?')) return;
    try { await deleteExpense(api, id); fetchData(); showToast('Deleted'); }
    catch { showToast('Failed to delete', 'error'); }
  }

  async function handleBulkDelete() {
    if (!confirm(`Delete ${selected.size} expenses?`)) return;
    try { await bulkDeleteExpenses(api, [...selected]); fetchData(); showToast(`${selected.size} expenses deleted`); }
    catch { showToast('Failed to delete', 'error'); }
  }

  async function handleExport() {
    try {
      const blob = await exportCsv(api, { startDate: filters.startDate, endDate: filters.endDate });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `expenses-${filters.startDate}-${filters.endDate}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch { showToast('Export failed', 'error'); }
  }

  async function handleUpdate(confirmed) {
    try {
      await updateExpense(api, editingExpense.id, confirmed[0]);
      setEditingExpense(null);
      fetchData();
      showToast('Updated');
    } catch { showToast('Failed to update', 'error'); }
  }

  const toggleSelect = (id) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected(s => s.size === expenses.length ? new Set() : new Set(expenses.map(e => e.id)));
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Filters */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Filter size={14} className="text-gray-400" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Filters</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-4">
          <div>
            <label className="label">From</label>
            <input type="date" className="input" value={filters.startDate} onChange={e => applyFilter('startDate', e.target.value)} />
          </div>
          <div>
            <label className="label">To</label>
            <input type="date" className="input" value={filters.endDate} onChange={e => applyFilter('endDate', e.target.value)} />
          </div>
          <div>
            <label className="label">Search</label>
            <input className="input" placeholder="description, notes…" value={filters.search}
              onChange={e => applyFilter('search', e.target.value)} />
          </div>
          <div>
            <label className="label">Category</label>
            <select className="input" value={filters.categoryIds[0] || ''}
              onChange={e => applyFilter('categoryIds', e.target.value ? [Number(e.target.value)] : [])}>
              <option value="">All categories</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Min amount</label>
            <input type="number" className="input" placeholder="0" value={filters.minAmount}
              onChange={e => applyFilter('minAmount', e.target.value)} />
          </div>
          <div>
            <label className="label">Max amount</label>
            <input type="number" className="input" value={filters.maxAmount}
              onChange={e => applyFilter('maxAmount', e.target.value)} />
          </div>
          <div>
            <label className="label">Sort by</label>
            <select className="input" value={`${filters.sortBy}_${filters.sortDir}`}
              onChange={e => { const [by, dir] = e.target.value.split('_'); applyFilter('sortBy', by); applyFilter('sortDir', dir); }}>
              <option value="date_DESC">Date (newest)</option>
              <option value="date_ASC">Date (oldest)</option>
              <option value="amount_DESC">Amount ↓</option>
              <option value="amount_ASC">Amount ↑</option>
            </select>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={clearFilters} className="btn-secondary text-xs py-1.5 px-3">Clear filters</button>
          <button onClick={handleExport} className="btn-secondary text-xs py-1.5 px-3">
            <Download size={12} /> Export CSV
          </button>
          <span className="text-xs text-gray-400 dark:text-slate-500 ml-auto">{total} transactions</span>
        </div>
      </div>

      {/* Bulk bar */}
      {selected.size > 0 && (
        <div className="card p-3.5 flex items-center gap-3 bg-brand-50 dark:bg-brand-900/20 border-brand-100 dark:border-brand-800/40 animate-slide-up">
          <span className="text-sm font-medium text-brand-700 dark:text-brand-300">{selected.size} selected</span>
          <button onClick={handleBulkDelete} className="btn-danger text-xs py-1.5 px-3">
            <Trash2 size={12} /> Delete selected
          </button>
          <button onClick={() => setSelected(new Set())} className="btn-secondary text-xs py-1.5 px-3">Clear</button>
        </div>
      )}

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-14"><Spinner size="lg" /></div>
        ) : !expenses.length ? (
          <EmptyState icon={<CreditCard size={32} />} title="No transactions found" description="Try adjusting your filters" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-slate-700/40 border-b border-gray-100 dark:border-slate-700">
                <tr>
                  <th className="px-4 py-3 w-8">
                    <input type="checkbox" checked={selected.size === expenses.length && expenses.length > 0}
                      onChange={toggleAll} className="rounded accent-brand-600 cursor-pointer" />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Description</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider hidden sm:table-cell">Category</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Amount</th>
                  <th className="px-4 py-3 w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-slate-700/50">
                {expenses.map(e => (
                  <tr key={e.id} className={`group hover:bg-gray-50 dark:hover:bg-slate-700/30 transition-colors ${selected.has(e.id) ? 'bg-brand-50/60 dark:bg-brand-900/10' : ''}`}>
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={selected.has(e.id)} onChange={() => toggleSelect(e.id)} className="rounded accent-brand-600 cursor-pointer" />
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-slate-400 whitespace-nowrap text-xs">{e.date}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 dark:text-white truncate max-w-xs">{e.description || e.category_name}</div>
                      {e.tags && <div className="text-xs text-brand-500 mt-0.5">{e.tags.split(',').map(t => `#${t.trim()}`).join(' ')}</div>}
                      {e.notes && <div className="text-xs text-gray-400 dark:text-slate-500 mt-0.5 truncate max-w-xs">{e.notes}</div>}
                      {e.is_recurring ? <span className="text-xs text-sky-500">recurring</span> : null}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <div className="flex items-center gap-1.5">
                        <span className="text-base">{e.category_icon}</span>
                        <div>
                          <div className="text-xs font-medium text-gray-700 dark:text-gray-300">{e.category_name}</div>
                          {e.subcategory_name && <div className="text-xs text-gray-400 dark:text-slate-500">{e.subcategory_name}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-white whitespace-nowrap">
                      {e.amount.toLocaleString()} <span className="text-xs font-normal text-gray-400">{e.currency}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => setEditingExpense(e)} className="p-1.5 text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20 rounded-lg transition-colors">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => handleDelete(e.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
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

        {/* Pagination */}
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

      {editingExpense && (
        <ParsedExpenseConfirm
          expenses={[{ ...editingExpense, category: editingExpense.category_name, subcategory: editingExpense.subcategory_name }]}
          categories={categories}
          onConfirm={handleUpdate}
          onClose={() => setEditingExpense(null)}
        />
      )}
    </div>
  );
}
