import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, RefreshCw } from 'lucide-react';
import useApi from '../hooks/useApi';
import { getRecurring, createRecurring, deleteRecurring } from '../api/recurringApi';
import { getCategories } from '../api/categoriesApi';
import { showToast } from '../components/common/Toast';
import Spinner from '../components/common/Spinner';
import EmptyState from '../components/common/EmptyState';
import Modal from '../components/common/Modal';
import TagInput from '../components/common/TagInput';

function today() { return new Date().toISOString().split('T')[0]; }
const emptyForm = { amount: '', currency: 'EGP', category: '', subcategory: '', description: '', tags: '', interval: 'monthly', nextDueDate: today() };

export default function Recurring() {
  const api = useApi();
  const [recurring, setRecurring]   = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [showForm, setShowForm]     = useState(false);
  const [form, setForm]             = useState(emptyForm);

  const fetchData = useCallback(async () => {
    try {
      const [r, c] = await Promise.all([getRecurring(api), getCategories(api)]);
      setRecurring(r.recurring);
      setCategories(c.categories);
    } catch { showToast('Failed to load', 'error'); }
    setLoading(false);
  }, [api]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleCreate(e) {
    e.preventDefault();
    if (!form.amount || !form.interval) return;
    try {
      await createRecurring(api, {
        amount: Number(form.amount), currency: form.currency,
        category: form.category, subcategory: form.subcategory,
        description: form.description, tags: form.tags,
        interval: form.interval, nextDueDate: form.nextDueDate,
      });
      setForm(emptyForm);
      setShowForm(false);
      fetchData();
      showToast('Recurring expense added');
    } catch { showToast('Failed to add', 'error'); }
  }

  async function handleDelete(id) {
    if (!confirm('Stop this recurring expense?')) return;
    try {
      await deleteRecurring(api, id);
      setRecurring(r => r.filter(x => x.id !== id));
      showToast('Recurring expense removed');
    } catch { showToast('Failed to delete', 'error'); }
  }

  const subcats = categories.find(c => c.name === form.category)?.subcategories || [];

  if (loading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-slate-400">{recurring.length} active</p>
        <button onClick={() => setShowForm(true)} className="btn-primary">
          <Plus size={14} /> Add recurring
        </button>
      </div>

      {!recurring.length ? (
        <div className="card">
          <EmptyState
            icon={<RefreshCw size={32} />}
            title="No recurring expenses"
            description="Add rent, subscriptions, or other regular expenses"
          />
        </div>
      ) : (
        <div className="space-y-3">
          {recurring.map(r => (
            <div key={r.id} className="card-hover p-4 flex items-center gap-4">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
                style={{ backgroundColor: (r.category_color || '#6b7280') + '22' }}
              >
                {r.category_icon || '🔄'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 dark:text-white text-sm">{r.description || r.category_name}</p>
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                  {r.category_name}{r.subcategory_name ? ` › ${r.subcategory_name}` : ''} · {r.interval_type}
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">Next: {r.next_due_date}</p>
                {r.tags && <p className="text-xs text-brand-500 mt-0.5">{r.tags.split(',').map(t => `#${t.trim()}`).join(' ')}</p>}
              </div>
              <div className="text-right shrink-0">
                <p className="font-bold text-gray-900 dark:text-white">{Number(r.amount).toLocaleString()} <span className="text-xs font-normal text-gray-400">{r.currency}</span></p>
                <p className="text-xs text-gray-400">per {r.interval_type}</p>
              </div>
              <button
                onClick={() => handleDelete(r.id)}
                className="p-2 text-gray-300 hover:text-red-500 dark:text-slate-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Add Recurring Expense" size="md">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Amount</label>
              <input type="number" className="input" required min="0.01" step="0.01" value={form.amount}
                onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} />
            </div>
            <div>
              <label className="label">Currency</label>
              <input className="input" value={form.currency} onChange={e => setForm(p => ({ ...p, currency: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Category</label>
              <select className="input" value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value, subcategory: '' }))}>
                <option value="">Select…</option>
                {categories.map(c => <option key={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Subcategory</label>
              {subcats.length
                ? <select className="input" value={form.subcategory} onChange={e => setForm(p => ({ ...p, subcategory: e.target.value }))}>
                    <option value="">None</option>
                    {subcats.map(s => <option key={s.id}>{s.name}</option>)}
                  </select>
                : <input className="input" placeholder="Optional" value={form.subcategory}
                    onChange={e => setForm(p => ({ ...p, subcategory: e.target.value }))} />
              }
            </div>
          </div>
          <div>
            <label className="label">Description</label>
            <input className="input" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Interval</label>
              <select className="input" value={form.interval} onChange={e => setForm(p => ({ ...p, interval: e.target.value }))}>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div>
              <label className="label">Next due date</label>
              <input type="date" className="input" value={form.nextDueDate} onChange={e => setForm(p => ({ ...p, nextDueDate: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="label">Tags</label>
            <TagInput value={form.tags} onChange={v => setForm(p => ({ ...p, tags: v }))} />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" className="btn-primary flex-1">Add recurring</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
