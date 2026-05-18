import { useState } from 'react';
import { showToast } from '../common/Toast';
import { createBudget, updateBudget, deleteBudget } from '../../api/budgetsApi';

export default function BudgetManager({ budgets, categories, api, onRefresh }) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ categoryId: '', amount: '', period: 'monthly' });
  const [editingId, setEditingId] = useState(null);
  const [editAmount, setEditAmount] = useState('');

  async function handleAdd(e) {
    e.preventDefault();
    if (!form.categoryId || !form.amount) return;
    try {
      await createBudget(api, { categoryId: Number(form.categoryId), amount: Number(form.amount), period: form.period });
      setForm({ categoryId: '', amount: '', period: 'monthly' });
      setAdding(false);
      onRefresh();
      showToast('Budget set');
    } catch { showToast('Failed to set budget', 'error'); }
  }

  async function handleEdit(id) {
    try {
      await updateBudget(api, id, Number(editAmount));
      setEditingId(null);
      onRefresh();
    } catch { showToast('Failed to update budget', 'error'); }
  }

  async function handleDelete(id) {
    try {
      await deleteBudget(api, id);
      onRefresh();
    } catch { showToast('Failed to delete budget', 'error'); }
  }

  const existingCatIds = new Set(budgets.map(b => b.category_id));
  const availableCats = categories.filter(c => !existingCatIds.has(c.id));

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium text-gray-900 dark:text-white">Monthly Budgets</h3>
        {availableCats.length > 0 && (
          <button onClick={() => setAdding(a => !a)} className="btn-secondary text-sm py-1">
            {adding ? 'Cancel' : '+ Add Budget'}
          </button>
        )}
      </div>

      {adding && (
        <form onSubmit={handleAdd} className="flex gap-2 mb-3 items-end flex-wrap">
          <div className="flex-1 min-w-[140px]">
            <label className="label">Category</label>
            <select className="input" value={form.categoryId} onChange={e => setForm(p => ({ ...p, categoryId: e.target.value }))}>
              <option value="">Select...</option>
              {availableCats.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Amount</label>
            <input type="number" className="input w-28" placeholder="1000" value={form.amount}
              onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} />
          </div>
          <button type="submit" className="btn-primary">Set</button>
        </form>
      )}

      {!budgets.length
        ? <p className="text-sm text-gray-400 dark:text-gray-500">No budgets set yet.</p>
        : (
          <div className="space-y-2">
            {budgets.map(b => (
              <div key={b.id} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <span className="text-lg">{b.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-gray-900 dark:text-white">{b.category_name}</span>
                    <span className={`text-xs font-semibold ${b.percentage >= 100 ? 'text-red-600' : b.percentage >= 80 ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {b.percentage}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-1.5 mt-1">
                    <div className={`h-1.5 rounded-full ${b.percentage >= 100 ? 'bg-red-500' : b.percentage >= 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                      style={{ width: `${Math.min(b.percentage, 100)}%` }} />
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {b.spent?.toLocaleString()} / {b.amount?.toLocaleString()} spent
                  </p>
                </div>
                {editingId === b.id
                  ? <div className="flex gap-1">
                      <input type="number" className="input w-24 text-sm" value={editAmount}
                        onChange={e => setEditAmount(e.target.value)} />
                      <button onClick={() => handleEdit(b.id)} className="btn-primary text-xs py-1 px-2">Save</button>
                      <button onClick={() => setEditingId(null)} className="btn-secondary text-xs py-1 px-2">✕</button>
                    </div>
                  : <div className="flex gap-1">
                      <button onClick={() => { setEditingId(b.id); setEditAmount(b.amount); }}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-sm">✏️</button>
                      <button onClick={() => handleDelete(b.id)} className="text-red-400 hover:text-red-600 text-sm">🗑️</button>
                    </div>
                }
              </div>
            ))}
          </div>
        )
      }
    </div>
  );
}
