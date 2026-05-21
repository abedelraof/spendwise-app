import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, Trash2, Pencil, Filter, CreditCard, ChevronDown, X, ArrowLeftRight } from 'lucide-react';
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

function CategoryPicker({ categories, categoryIds, subcategoryIds, onChange }) {
  const [open, setOpen]     = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const q = search.toLowerCase();
  const filtered = categories
    .map(c => ({
      ...c,
      matchSelf: c.name.toLowerCase().includes(q),
      subs: (c.subcategories || []).filter(s => !q || s.name.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)),
    }))
    .filter(c => c.matchSelf || c.subs.length > 0);

  const selectedLabel = (() => {
    if (subcategoryIds[0]) {
      for (const c of categories) {
        const s = (c.subcategories || []).find(s => s.id === subcategoryIds[0]);
        if (s) return `${c.icon ?? ''} ${c.name} › ${s.name}`;
      }
    }
    if (categoryIds[0]) {
      const c = categories.find(c => c.id === categoryIds[0]);
      return c ? `${c.icon ?? ''} ${c.name}` : '';
    }
    return null;
  })();

  function select(catId, subId) {
    onChange(catId, subId);
    setOpen(false);
    setSearch('');
  }

  return (
    <div ref={ref} className="relative flex flex-col gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500 pl-0.5">Category</span>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="input !py-1.5 !text-xs w-44 flex items-center justify-between gap-1 text-left"
      >
        <span className="truncate">{selectedLabel ?? <span className="text-gray-400 dark:text-slate-500">All categories</span>}</span>
        <div className="flex items-center gap-0.5 shrink-0">
          {selectedLabel && (
            <span onMouseDown={e => { e.stopPropagation(); select(null, null); }}
              className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-400">
              <X size={10} />
            </span>
          )}
          <ChevronDown size={11} className="text-gray-400" />
        </div>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-56 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-lg z-50 overflow-hidden">
          <div className="p-2 border-b border-gray-100 dark:border-slate-700">
            <input
              autoFocus
              className="input !py-1 !text-xs w-full"
              placeholder="Search categories…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {!search && (
              <button onClick={() => select(null, null)}
                className="w-full text-left px-3 py-1.5 text-xs text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700/60">
                All categories
              </button>
            )}
            {filtered.map(c => (
              <div key={c.id}>
                <button onClick={() => select(c.id, null)}
                  className="w-full text-left px-3 py-1.5 text-xs font-medium text-gray-800 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700/60 flex items-center gap-1.5">
                  <span>{c.icon}</span>{c.name}
                </button>
                {c.subs.map(s => (
                  <button key={s.id} onClick={() => select(null, s.id)}
                    className="w-full text-left pl-7 pr-3 py-1.5 text-xs text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700/60">
                    ↳ {s.name}
                  </button>
                ))}
              </div>
            ))}
            {filtered.length === 0 && (
              <p className="px-3 py-3 text-xs text-gray-400 dark:text-slate-500 text-center">No matches</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

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
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <ArrowLeftRight size={20} className="text-brand-500" /> Transactions
        </h2>
        <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">
          Browse, search and manage all your expenses
        </p>
      </div>

      {/* Filters */}
      <div className="card px-3 py-2.5 flex flex-wrap items-end gap-2">
        {[
          <div key="from" className="flex flex-col gap-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500 pl-0.5">From</span>
            <input type="date" className="input !py-1.5 !text-xs w-32" value={filters.startDate} onChange={e => applyFilter('startDate', e.target.value)} />
          </div>,
          <div key="to" className="flex flex-col gap-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500 pl-0.5">To</span>
            <input type="date" className="input !py-1.5 !text-xs w-32" value={filters.endDate} onChange={e => applyFilter('endDate', e.target.value)} />
          </div>,
          <div key="search" className="flex flex-col gap-0.5 flex-1 min-w-32">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500 pl-0.5">Search</span>
            <input className="input !py-1.5 !text-xs" placeholder="description, notes…" value={filters.search} onChange={e => applyFilter('search', e.target.value)} />
          </div>,
          <CategoryPicker
            key="cat"
            categories={categories}
            categoryIds={filters.categoryIds}
            subcategoryIds={filters.subcategoryIds}
            onChange={(catId, subId) => {
              setFilters(f => ({ ...f, categoryIds: catId ? [catId] : [], subcategoryIds: subId ? [subId] : [] }));
              setPage(0);
            }}
          />,
          <div key="min" className="flex flex-col gap-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500 pl-0.5">Min</span>
            <input type="number" className="input !py-1.5 !text-xs w-24" placeholder="0" value={filters.minAmount} onChange={e => applyFilter('minAmount', e.target.value)} />
          </div>,
          <div key="max" className="flex flex-col gap-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500 pl-0.5">Max</span>
            <input type="number" className="input !py-1.5 !text-xs w-24" placeholder="∞" value={filters.maxAmount} onChange={e => applyFilter('maxAmount', e.target.value)} />
          </div>,
          <div key="sort" className="flex flex-col gap-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500 pl-0.5">Sort</span>
            <select className="input !py-1.5 !text-xs w-36" value={`${filters.sortBy}_${filters.sortDir}`} onChange={e => { const [by, dir] = e.target.value.split('_'); applyFilter('sortBy', by); applyFilter('sortDir', dir); }}>
              <option value="date_DESC">Newest first</option>
              <option value="date_ASC">Oldest first</option>
              <option value="amount_DESC">Amount ↓</option>
              <option value="amount_ASC">Amount ↑</option>
            </select>
          </div>,
        ]}
        <div className="flex items-center gap-2 ml-auto">
          <button onClick={clearFilters} className="btn-secondary !py-1.5 !px-2.5 !text-xs">Clear</button>
          <button onClick={handleExport} className="btn-secondary !py-1.5 !px-2.5 !text-xs"><Download size={11} /> CSV</button>
          <span className="text-xs text-gray-400 dark:text-slate-500">{total} rows</span>
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
