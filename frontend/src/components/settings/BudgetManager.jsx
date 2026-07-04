import { useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { showToast } from '../common/Toast';
import EmptyState from '../common/EmptyState';
import { createBudget, updateBudget, deleteBudget, setBudgetCap } from '../../api/budgetsApi';

function errorMessage(err, fallback) {
  return err?.response?.data?.error || fallback;
}

function CapSummary({ cap, api, onRefresh }) {
  const [editing, setEditing] = useState(false);
  const [amount,  setAmount]  = useState('');
  const [saving,  setSaving]  = useState(false);

  const hasCap = cap?.cap != null;
  const pct = hasCap && cap.cap > 0 ? Math.min(100, Math.round((cap.allocated / cap.cap) * 100)) : 0;
  const barColor = pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-brand-500';

  async function handleSave() {
    const value = amount.trim() === '' ? null : Number(amount);
    setSaving(true);
    try {
      await setBudgetCap(api, value);
      setEditing(false);
      onRefresh();
      showToast(value == null ? 'Monthly budget cleared' : 'Monthly budget set');
    } catch (err) {
      showToast(errorMessage(err, 'Failed to set monthly budget'), 'error');
    }
    setSaving(false);
  }

  return (
    <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-700/60 bg-gray-50/60 dark:bg-slate-800/40">
      {editing ? (
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label">Monthly budget (blank to clear)</label>
            <input type="number" min="0" step="0.01" className="input w-40" placeholder="e.g. 5000"
              value={amount} onChange={e => setAmount(e.target.value)} autoFocus />
          </div>
          <button onClick={handleSave} disabled={saving} className="btn-primary text-xs py-1.5 px-3">Save</button>
          <button onClick={() => setEditing(false)} className="btn-secondary text-xs py-1.5 px-3">Cancel</button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                {hasCap ? 'Monthly Budget' : 'No monthly budget set'}
              </p>
              {hasCap && (
                <span className="text-xs text-gray-500 dark:text-slate-400">
                  {Number(cap.allocated).toLocaleString()} / {Number(cap.cap).toLocaleString()} allocated
                  {cap.remaining != null && (
                    <span className={`ml-1.5 font-semibold ${cap.remaining < 0 ? 'text-red-500' : ''}`}>
                      ({Number(cap.remaining).toLocaleString()} left)
                    </span>
                  )}
                </span>
              )}
            </div>
            {hasCap && (
              <div className="w-full bg-gray-100 dark:bg-slate-700 rounded-full h-2">
                <div className={`h-2 rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
              </div>
            )}
          </div>
          <button
            onClick={() => { setEditing(true); setAmount(hasCap ? String(cap.cap) : ''); }}
            className="btn-secondary text-xs py-1.5 px-3 shrink-0">
            {hasCap ? 'Edit' : 'Set Monthly Budget'}
          </button>
        </div>
      )}
    </div>
  );
}

export default function BudgetManager({ budgets, categories, api, onRefresh, cap }) {
  const [adding,    setAdding]    = useState(false);
  const [form,      setForm]      = useState({ categoryId: '', amount: '', period: 'monthly' });
  const [editingId, setEditingId] = useState(null);
  const [editAmount,setEditAmount]= useState('');

  async function handleAdd(e) {
    e.preventDefault();
    if (!form.categoryId || !form.amount) return;
    try {
      await createBudget(api, {
        categoryId: Number(form.categoryId),
        amount: Number(form.amount),
        period: form.period,
      });
      setForm({ categoryId: '', amount: '', period: 'monthly' });
      setAdding(false);
      onRefresh();
      showToast('Budget set');
    } catch (err) { showToast(errorMessage(err, 'Failed to set budget'), 'error'); }
  }

  async function handleEdit(id) {
    try {
      await updateBudget(api, id, Number(editAmount));
      setEditingId(null);
      onRefresh();
      showToast('Budget updated');
    } catch (err) { showToast(errorMessage(err, 'Failed to update budget'), 'error'); }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this budget?')) return;
    try { await deleteBudget(api, id); onRefresh(); showToast('Budget deleted'); }
    catch (err) { showToast(errorMessage(err, 'Failed to delete budget'), 'error'); }
  }

  const existingCatIds  = new Set(budgets.map(b => b.category_id));
  const availableCats   = categories.filter(c => !existingCatIds.has(c.id));

  return (
    <div className="card overflow-hidden">
      {/* Overall monthly budget */}
      {cap && <CapSummary cap={cap} api={api} onRefresh={onRefresh} />}

      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-700/60 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Category Budgets</h3>
        {availableCats.length > 0 && (
          <button
            onClick={() => { setAdding(a => !a); setForm({ categoryId: '', amount: '', period: 'monthly' }); }}
            className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1">
            {adding ? '✕ Cancel' : <><Plus size={12} /> Add Budget</>}
          </button>
        )}
      </div>

      {/* Inline add form */}
      {adding && (
        <form onSubmit={handleAdd}
          className="px-5 py-4 border-b border-gray-100 dark:border-slate-700/60 flex flex-wrap items-end gap-3 bg-gray-50/60 dark:bg-slate-800/40">
          <div className="flex-1 min-w-[160px]">
            <label className="label">Category</label>
            <select className="input" value={form.categoryId}
              onChange={e => setForm(p => ({ ...p, categoryId: e.target.value }))}>
              <option value="">Select…</option>
              {availableCats.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Monthly limit</label>
            <input type="number" min="1" step="0.01" className="input w-32" placeholder="e.g. 2000"
              value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} />
          </div>
          <button type="submit" className="btn-primary">Set Budget</button>
        </form>
      )}

      {/* Budget rows */}
      {!budgets.length ? (
        <div className="p-6">
          <EmptyState icon="📊" title="No budgets yet" description="Set a monthly limit per category to track your spending" />
        </div>
      ) : (
        <div className="divide-y divide-gray-50 dark:divide-slate-700/50">
          {budgets.map(b => {
            const pct  = Math.min(100, Math.round(b.percentage ?? 0));
            const barColor = pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-brand-500';
            const pctColor = pct >= 100 ? 'text-red-600 dark:text-red-400' : pct >= 80 ? 'text-amber-600 dark:text-amber-400' : 'text-brand-600 dark:text-brand-400';

            return (
              <div key={b.id} className="px-5 py-4 flex items-start gap-4">
                <div className="text-2xl shrink-0 mt-0.5">{b.icon ?? '📊'}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <p className="font-semibold text-sm text-gray-900 dark:text-white truncate">{b.category_name}</p>
                    <div className="flex items-center gap-1 shrink-0">
                      {editingId === b.id ? (
                        <>
                          <input type="number" min="1" step="0.01"
                            className="input !py-0.5 !px-2 !text-xs w-24"
                            value={editAmount}
                            onChange={e => setEditAmount(e.target.value)}
                            autoFocus
                          />
                          <button onClick={() => handleEdit(b.id)}
                            className="btn-primary !py-0.5 !px-2 !text-xs">Save</button>
                          <button onClick={() => setEditingId(null)}
                            className="btn-secondary !py-0.5 !px-2 !text-xs">✕</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => { setEditingId(b.id); setEditAmount(String(b.amount)); }}
                            className="p-1 rounded text-gray-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors">
                            <Pencil size={12} />
                          </button>
                          <button onClick={() => handleDelete(b.id)}
                            className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                            <Trash2 size={12} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="w-full bg-gray-100 dark:bg-slate-700 rounded-full h-2 mb-1.5">
                    <div className={`h-2 rounded-full transition-all ${barColor}`}
                      style={{ width: `${pct}%` }} />
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-500 dark:text-slate-400">
                    <span>
                      {Number(b.spent ?? 0).toLocaleString()} / {Number(b.amount).toLocaleString()} spent
                      <span className={`ml-1.5 font-semibold ${pctColor}`}>{pct}%</span>
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
