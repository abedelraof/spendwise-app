import { useState, useEffect, useCallback } from 'react';
import { Target, PieChart, Plus, Pencil, Trash2 } from 'lucide-react';
import useApi from '../hooks/useApi';
import useAuth from '../hooks/useAuth';
import Modal from '../components/common/Modal';
import Spinner from '../components/common/Spinner';
import EmptyState from '../components/common/EmptyState';
import { showToast } from '../components/common/Toast';
import BudgetManager from '../components/settings/BudgetManager';
import { getGoals, createGoal, updateGoal, deleteGoal } from '../api/goalsApi';
import { getBudgets } from '../api/budgetsApi';
import { getCategories } from '../api/categoriesApi';
import { getAccounts } from '../api/accountsApi';
import { getSettings } from '../api/settingsApi';

const CURRENCIES = ['EGP', 'USD', 'EUR', 'GBP', 'ILS', 'SAR', 'AED', 'CAD', 'JPY', 'CHF', 'CNY'];
const GOAL_ICONS = ['🎯', '🏠', '🚗', '✈️', '💍', '🎓', '💰', '🏖️', '📱', '🏋️'];

// ── Goal Form Modal ────────────────────────────────────────────────────────────
function GoalFormModal({ goal, accounts, defaultCurrency, onSave, onClose }) {
  const isEdit = !!goal;
  const [name,           setName]           = useState(goal?.name ?? '');
  const [icon,           setIcon]           = useState(goal?.icon ?? '🎯');
  const [targetAmount,   setTargetAmount]   = useState(String(goal?.target_amount ?? ''));
  const [targetCurrency, setTargetCurrency] = useState(goal?.target_currency ?? defaultCurrency ?? 'EGP');
  const [accountId,      setAccountId]      = useState(String(goal?.account_id ?? ''));
  const [currentAmount,  setCurrentAmount]  = useState(String(goal?.current_amount ?? '0'));
  const [targetDate,     setTargetDate]     = useState(goal?.target_date ?? '');
  const [saving,         setSaving]         = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim() || !targetAmount) return;
    setSaving(true);
    try {
      await onSave({
        name: name.trim(), icon,
        target_amount: parseFloat(targetAmount),
        target_currency: targetCurrency,
        account_id: accountId ? Number(accountId) : null,
        current_amount: accountId ? 0 : parseFloat(currentAmount || '0'),
        target_date: targetDate || null,
      });
      onClose();
    } finally { setSaving(false); }
  }

  return (
    <Modal open onClose={onClose} title={isEdit ? 'Edit Goal' : 'Add Savings Goal'} size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label">Icon</label>
          <div className="flex gap-2 flex-wrap">
            {GOAL_ICONS.map(ic => (
              <button key={ic} type="button" onClick={() => setIcon(ic)}
                className={`w-9 h-9 rounded-xl text-lg flex items-center justify-center transition-all ${
                  icon === ic
                    ? 'bg-brand-100 dark:bg-brand-800/60 ring-2 ring-brand-500'
                    : 'bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600'
                }`}>
                {ic}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="label">Goal Name *</label>
          <input className="input" value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g. Emergency Fund, New Car" required autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Target Amount *</label>
            <input type="number" step="0.01" min="0.01" className="input" value={targetAmount}
              onChange={e => setTargetAmount(e.target.value)} required />
          </div>
          <div>
            <label className="label">Currency</label>
            <select className="input" value={targetCurrency} onChange={e => setTargetCurrency(e.target.value)}>
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="label">Target Date (optional)</label>
          <input type="date" className="input" value={targetDate} onChange={e => setTargetDate(e.target.value)} />
        </div>
        <div>
          <label className="label">Link to Account (optional)</label>
          <select className="input" value={accountId} onChange={e => setAccountId(e.target.value)}>
            <option value="">None — track manually</option>
            {accounts.filter(a => a.type !== 'liability').map(a => (
              <option key={a.id} value={a.id}>{a.icon} {a.name} ({a.currency})</option>
            ))}
          </select>
          <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">
            When linked, progress is auto-computed from the account's latest balance.
          </p>
        </div>
        {!accountId && (
          <div>
            <label className="label">Current Amount Saved</label>
            <input type="number" step="0.01" min="0" className="input" value={currentAmount}
              onChange={e => setCurrentAmount(e.target.value)} />
          </div>
        )}
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button type="submit" disabled={saving || !name.trim() || !targetAmount} className="btn-primary flex-1">
            {isEdit ? 'Save Changes' : 'Add Goal'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Goals Section ──────────────────────────────────────────────────────────────
function GoalsSection({ goals, accounts, onAdd, onEdit, onDelete }) {
  const fmtG = n => Number(n ?? 0).toLocaleString('en', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  function getProgress(goal) {
    let current = goal.current_amount ?? 0;
    if (goal.account_id && goal.latest_balance != null) current = goal.latest_balance;
    const pct = goal.target_amount > 0
      ? Math.min(100, Math.round((current / goal.target_amount) * 100)) : 0;
    return { current, pct };
  }

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-700/60 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Savings Goals</h3>
        <button onClick={onAdd} className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1">
          <Plus size={12} /> Add Goal
        </button>
      </div>
      {!goals.length ? (
        <div className="p-6">
          <EmptyState icon="🎯" title="No goals yet" description="Set a savings target and track your progress" />
        </div>
      ) : (
        <div className="divide-y divide-gray-50 dark:divide-slate-700/50">
          {goals.map(goal => {
            const { current, pct } = getProgress(goal);
            const daysLeft = goal.target_date
              ? Math.ceil((new Date(goal.target_date) - new Date()) / (1000 * 60 * 60 * 24)) : null;
            return (
              <div key={goal.id} className="px-5 py-4 flex items-start gap-4">
                <div className="text-2xl shrink-0 mt-0.5">{goal.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <p className="font-semibold text-sm text-gray-900 dark:text-white truncate">{goal.name}</p>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => onEdit(goal)}
                        className="p-1 rounded text-gray-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors">
                        <Pencil size={12} />
                      </button>
                      <button onClick={() => onDelete(goal.id)}
                        className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                  <div className="w-full bg-gray-100 dark:bg-slate-700 rounded-full h-2 mb-1.5">
                    <div
                      className={`h-2 rounded-full transition-all ${pct >= 100 ? 'bg-emerald-500' : 'bg-brand-500'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-500 dark:text-slate-400">
                    <span>
                      {fmtG(current)} / {fmtG(goal.target_amount)} {goal.target_currency}
                      <span className="ml-1.5 font-semibold text-brand-600 dark:text-brand-400">{pct}%</span>
                    </span>
                    <span className="flex items-center gap-2">
                      {goal.account_name && (
                        <span className="text-brand-500 truncate max-w-[80px]">via {goal.account_name}</span>
                      )}
                      {daysLeft != null && (
                        <span className={daysLeft < 0 ? 'text-red-500' : daysLeft < 30 ? 'text-amber-500' : ''}>
                          {daysLeft < 0 ? 'Overdue' : `${daysLeft}d left`}
                        </span>
                      )}
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

// ── Page ───────────────────────────────────────────────────────────────────────
export default function Planning() {
  const api = useApi();
  const { user } = useAuth();

  const [goals,          setGoals]          = useState([]);
  const [budgets,        setBudgets]        = useState([]);
  const [categories,     setCategories]     = useState([]);
  const [accounts,       setAccounts]       = useState([]);
  const [homeCurrency,   setHomeCurrency]   = useState(user?.currency ?? 'EGP');
  const [loading,        setLoading]        = useState(true);
  const [showAddGoal,    setShowAddGoal]    = useState(false);
  const [editGoalTarget, setEditGoalTarget] = useState(null);

  const fetchAll = useCallback(async () => {
    const [goalsRes, budgetsRes, catsRes, accRes, settingsRes] = await Promise.allSettled([
      getGoals(api),
      getBudgets(api),
      getCategories(api),
      getAccounts(api),
      getSettings(api),
    ]);
    if (goalsRes.status    === 'fulfilled') setGoals(goalsRes.value.goals);
    if (budgetsRes.status  === 'fulfilled') setBudgets(budgetsRes.value.budgets);
    if (catsRes.status     === 'fulfilled') setCategories(catsRes.value.categories);
    if (accRes.status      === 'fulfilled') setAccounts(accRes.value.accounts);
    if (settingsRes.status === 'fulfilled') setHomeCurrency(settingsRes.value.currency ?? user?.currency ?? 'EGP');
    setLoading(false);
  }, [api]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function handleCreateGoal(data) {
    try {
      const d = await createGoal(api, data);
      setGoals(d.goals);
      showToast('Goal added');
    } catch { showToast('Failed to create goal', 'error'); throw new Error(); }
  }

  async function handleUpdateGoal(data) {
    try {
      const d = await updateGoal(api, editGoalTarget.id, data);
      setGoals(d.goals);
      showToast('Goal updated');
    } catch { showToast('Failed to update goal', 'error'); throw new Error(); }
  }

  async function handleDeleteGoal(id) {
    if (!window.confirm('Delete this savings goal?')) return;
    try {
      await deleteGoal(api, id);
      setGoals(g => g.filter(x => x.id !== id));
      showToast('Goal deleted');
    } catch { showToast('Failed to delete goal', 'error'); }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64"><Spinner /></div>
  );

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Page header */}
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Target size={20} className="text-brand-500" /> Planning
        </h2>
        <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">Budgets &amp; savings goals</p>
      </div>

      {/* Savings Goals */}
      <GoalsSection
        goals={goals}
        accounts={accounts}
        onAdd={() => setShowAddGoal(true)}
        onEdit={g => setEditGoalTarget(g)}
        onDelete={handleDeleteGoal}
      />

      {/* Monthly Budgets */}
      <div className="card p-6 space-y-5">
        <div className="flex items-center gap-2.5 pb-4 border-b border-gray-100 dark:border-slate-700/60">
          <div className="w-7 h-7 bg-brand-50 dark:bg-brand-900/30 rounded-lg flex items-center justify-center">
            <PieChart size={14} className="text-brand-600 dark:text-brand-400" />
          </div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Monthly Budgets</h2>
        </div>
        <BudgetManager budgets={budgets} categories={categories} api={api} onRefresh={fetchAll} />
      </div>

      {/* Modals */}
      {showAddGoal && (
        <GoalFormModal accounts={accounts} defaultCurrency={homeCurrency}
          onSave={handleCreateGoal} onClose={() => setShowAddGoal(false)} />
      )}
      {editGoalTarget && (
        <GoalFormModal goal={editGoalTarget} accounts={accounts} defaultCurrency={homeCurrency}
          onSave={handleUpdateGoal} onClose={() => setEditGoalTarget(null)} />
      )}
    </div>
  );
}
