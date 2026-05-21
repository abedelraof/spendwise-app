import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Pencil, Trash2, History, Wallet, ClipboardList, GripVertical, ChevronDown, ChevronRight, FolderOpen } from 'lucide-react';
import useApi from '../hooks/useApi';
import useAuth from '../hooks/useAuth';
import Modal from '../components/common/Modal';
import Spinner from '../components/common/Spinner';
import EmptyState from '../components/common/EmptyState';
import { showToast } from '../components/common/Toast';
import {
  getAccounts, createAccount, updateAccount, deleteAccount,
  getHistory, recordBalances, getRates, updateBalance, deleteBalance, reorderAccounts,
  getAccountGroups, createAccountGroup, updateAccountGroup, deleteAccountGroup,
} from '../api/accountsApi';
import { getGoals, createGoal, updateGoal, deleteGoal } from '../api/goalsApi';
import { getSettings } from '../api/settingsApi';

const ICONS        = ['🏦', '💵', '💳', '🏧', '💰', '📱', '🏠', '💼'];
const GROUP_ICONS  = ['📁', '💰', '🏦', '📈', '🏠', '🚗', '✈️', '💊', '🎓', '🛒', '💼', '⚙️'];
const CURRENCIES = ['EGP', 'USD', 'EUR', 'GBP', 'ILS', 'SAR', 'AED', 'CAD', 'JPY', 'CHF', 'CNY'];
const COLORS     = ['#7c3aed','#3b82f6','#10b981','#f97316','#f59e0b','#ec4899','#6366f1','#14b8a6'];
const UNITS      = ['g', 'oz', 'kg', 'tola', 'baht'];

const today = () => new Date().toISOString().split('T')[0];
const fmt   = (n) => Number(n ?? 0).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtK  = (n) => {
  const v = Math.abs(Number(n ?? 0));
  if (v >= 1_000_000) return (Number(n) / 1_000_000).toFixed(1) + 'M';
  if (v >= 1_000)     return (Number(n) / 1_000).toFixed(1) + 'K';
  return Number(n).toFixed(0);
};


// ── Add / Edit modal ──────────────────────────────────────────────────────────
function AccountFormModal({ account, defaultCurrency, groups = [], onSave, onClose }) {
  const isEdit = !!account;
  const [name,     setName]     = useState(account?.name     ?? '');
  const [currency, setCurrency] = useState(account?.currency ?? defaultCurrency ?? 'EGP');
  const [icon,     setIcon]     = useState(account?.icon     ?? '🏦');
  const [type,     setType]     = useState(account?.type     ?? 'monetary');
  const [unit,     setUnit]     = useState(account?.unit     ?? 'g');
  const [groupId,  setGroupId]  = useState(account?.group_id ?? null);
  const [saving,   setSaving]   = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({ name: name.trim(), currency, icon, type, unit: type === 'commodity' ? unit : null, group_id: groupId });
      onClose();
    } finally { setSaving(false); }
  }

  return (
    <Modal open onClose={onClose} title={isEdit ? 'Edit Account' : 'Add Account'} size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label">Icon</label>
          <div className="flex gap-2 flex-wrap">
            {ICONS.map(ic => (
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
          <label className="label">Account Name *</label>
          <input className="input" value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g. CIB Bank, Cash, Wallet" required autoFocus />
        </div>
        <div>
          <label className="label">Currency</label>
          <select className="input" value={currency} onChange={e => setCurrency(e.target.value)}>
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Account Type</label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { value: 'monetary',  emoji: '💳', label: 'Monetary'  },
              { value: 'commodity', emoji: '🪙', label: 'Commodity' },
              { value: 'liability', emoji: '🔴', label: 'Liability' },
            ].map(opt => (
              <button key={opt.value} type="button" onClick={() => setType(opt.value)}
                className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                  type === opt.value
                    ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 ring-2 ring-brand-500/30'
                    : 'border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-gray-600 dark:text-slate-400 hover:border-gray-300 dark:hover:border-slate-600'
                }`}>
                <span>{opt.emoji}</span> {opt.label}
              </button>
            ))}
          </div>
        </div>
        {type === 'commodity' && (
          <div>
            <label className="label">Unit</label>
            <select className="input" value={unit} onChange={e => setUnit(e.target.value)}>
              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        )}
        {groups.length > 0 && (
          <div>
            <label className="label">Group (optional)</label>
            <select className="input" value={groupId ?? ''} onChange={e => setGroupId(e.target.value ? parseInt(e.target.value) : null)}>
              <option value="">No group</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.icon} {g.name}</option>)}
            </select>
          </div>
        )}
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button type="submit" disabled={saving || !name.trim()} className="btn-primary flex-1">
            {isEdit ? 'Save Changes' : 'Add Account'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Record Balances modal ─────────────────────────────────────────────────────
function RecordModal({ accounts, rates, homeCurrency, onSave, onClose }) {
  // monetary: values[id] = '5000'
  // commodity: values[id] = { quantity: '120', pricePerUnit: '3200' }
  const [values, setValues] = useState(() =>
    Object.fromEntries(accounts.map(a => {
      if (a.type === 'commodity') {
        return [a.id, {
          quantity:     a.latest_quantity     != null ? String(a.latest_quantity)     : '',
          pricePerUnit: a.latest_price_per_unit != null ? String(a.latest_price_per_unit) : '',
        }];
      }
      return [a.id, a.latest_balance != null ? String(a.latest_balance) : ''];
    }))
  );
  const [recordedDate, setRecordedDate] = useState(today());
  const [notes,  setNotes]  = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  function requestClose() { setConfirmClose(true); }

  function setQty(id, val)  { setValues(v => ({ ...v, [id]: { ...v[id], quantity:     val } })); }
  function setPpu(id, val)  { setValues(v => ({ ...v, [id]: { ...v[id], pricePerUnit: val } })); }

  function getRate(currency) {
    if (!rates?.rates || currency === homeCurrency) return 1.0;
    return rates.rates[currency] ?? 1.0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const entries = accounts.flatMap(a => {
      const exchangeRate = getRate(a.currency);
      if (a.type === 'commodity') {
        const { quantity, pricePerUnit } = values[a.id] ?? {};
        if (quantity !== '' && pricePerUnit !== '' && quantity !== undefined && pricePerUnit !== undefined) {
          return [{ accountId: a.id, quantity, pricePerUnit, exchangeRate }];
        }
        return [];
      }
      const v = values[a.id];
      if (v !== '' && v !== undefined) return [{ accountId: a.id, balance: v, exchangeRate }];
      return [];
    });
    if (!entries.length) return showToast('Enter at least one balance', 'warning');
    setSaving(true);
    try {
      await onSave({ entries, recordedDate, notes: notes.trim() || undefined });
      onClose();
    } finally { setSaving(false); }
  }

  return (
    <Modal open onClose={requestClose} size="lg" hideHeader>
      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Date row */}
        <div className="flex items-center gap-3">
          <label className="text-sm font-semibold text-gray-900 dark:text-white shrink-0">Snapshot Date</label>
          <input type="date" className="input flex-1" value={recordedDate}
            onChange={e => setRecordedDate(e.target.value)} />
        </div>

        {/* Scrollable accounts grid */}
        <div className="max-h-[60vh] overflow-y-auto -mx-1 px-1">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {accounts.map(a => {
              const qty = values[a.id]?.quantity ?? '';
              const ppu = values[a.id]?.pricePerUnit ?? '';
              const total = qty && ppu ? parseFloat(qty) * parseFloat(ppu) : null;
              return (
                <div key={a.id} className="flex items-center gap-2.5 p-2.5 rounded-xl bg-gray-50 dark:bg-slate-800/60">
                  {/* Icon + name */}
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm shrink-0"
                    style={{ backgroundColor: a.color + '22' }}>
                    {a.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-900 dark:text-white truncate leading-tight">{a.name}</p>
                    <span className="text-[10px] text-gray-400 bg-gray-200 dark:bg-slate-700 rounded px-1">
                      {a.currency}{a.type === 'commodity' ? ` · ${a.unit}` : ''}
                    </span>
                  </div>
                  {/* Input(s) */}
                  {a.type === 'commodity' ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <input type="number" step="any" min="0" placeholder="Qty"
                        className="w-16 h-8 text-xs text-right rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 focus:outline-none focus:ring-1 focus:ring-brand-500"
                        value={qty} onChange={e => setQty(a.id, e.target.value)} />
                      <span className="text-gray-300 dark:text-slate-600 text-xs">×</span>
                      <input type="number" step="any" min="0" placeholder="Price"
                        className="w-20 h-8 text-xs text-right rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 focus:outline-none focus:ring-1 focus:ring-brand-500"
                        value={ppu} onChange={e => setPpu(a.id, e.target.value)} />
                      {total != null && (
                        <span className="text-[10px] text-brand-500 dark:text-brand-400 font-semibold whitespace-nowrap">
                          = {fmt(total)}
                        </span>
                      )}
                    </div>
                  ) : (
                    <input type="number" step="0.01" placeholder="0.00"
                      className="w-28 h-8 text-sm text-right rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 focus:outline-none focus:ring-1 focus:ring-brand-500 shrink-0"
                      value={values[a.id] ?? ''}
                      onChange={e => setValues(v => ({ ...v, [a.id]: e.target.value }))} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="label">Notes (optional)</label>
          <input className="input" placeholder="e.g. End of month snapshot"
            value={notes} onChange={e => setNotes(e.target.value)} />
        </div>

        <div className="flex gap-3">
          <button type="button" onClick={requestClose} className="btn-secondary flex-1">Cancel</button>
          <button type="submit" disabled={saving || confirmClose} className="btn-primary flex-1">
            {saving ? 'Saving…' : 'Save Balances'}
          </button>
        </div>
      </form>

      {/* Confirmation strip — outside the form so it can never trigger submit */}
      {confirmClose && (
        <div className="mt-3 flex items-center gap-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40">
          <p className="flex-1 text-sm text-amber-800 dark:text-amber-300 font-medium">Discard unsaved balances?</p>
          <button type="button" onClick={() => setConfirmClose(false)}
            className="btn-secondary text-xs px-3 py-1.5">Keep editing</button>
          <button type="button" onClick={onClose}
            className="btn-danger text-xs px-3 py-1.5">Discard</button>
        </div>
      )}
    </Modal>
  );
}

// ── History modal ─────────────────────────────────────────────────────────────
function HistoryModal({ account, api, onClose }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getHistory(api, account.id)
      .then(d => setHistory(d.history))
      .finally(() => setLoading(false));
  }, [api, account.id]);

  return (
    <Modal open onClose={onClose} title={`${account.icon} ${account.name} — History`} size="md">
      {loading ? (
        <div className="flex justify-center py-10"><Spinner size="lg" /></div>
      ) : !history.length ? (
        <EmptyState icon="📊" title="No history yet" description="Record balances to start tracking" />
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto">
            {history.map(h => (
              <div key={h.id} className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-slate-800/50">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{h.recorded_date}</p>
                  {h.notes && <p className="text-xs text-gray-400 mt-0.5">{h.notes}</p>}
                </div>
                <p className="font-semibold text-gray-900 dark:text-white text-sm">
                  {fmt(h.balance)} <span className="text-xs font-normal text-gray-400">{account.currency}</span>
                </p>
              </div>
            ))}
        </div>
      )}
    </Modal>
  );
}

const GOAL_ICONS    = ['🎯', '🏠', '🚗', '✈️', '💍', '🎓', '💰', '🏖️', '📱', '🏋️'];

// ── Goal Form Modal ───────────────────────────────────────────────────────────
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

// ── Goals Section ─────────────────────────────────────────────────────────────
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

// ── Group Form Modal ─────────────────────────────────────────────────────────
function GroupFormModal({ group, onSave, onClose }) {
  const isEdit = !!group;
  const [name,   setName]   = useState(group?.name ?? '');
  const [icon,   setIcon]   = useState(group?.icon ?? '📁');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({ name: name.trim(), icon });
      onClose();
    } finally { setSaving(false); }
  }

  return (
    <Modal open onClose={onClose} title={isEdit ? 'Edit Group' : 'Add Group'} size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label">Icon</label>
          <div className="flex gap-2 flex-wrap">
            {GROUP_ICONS.map(ic => (
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
          <label className="label">Group Name</label>
          <input className="input" value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g. Savings, Investments…" autoFocus />
        </div>
        <div className="flex gap-2 justify-end pt-1">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={saving || !name.trim()} className="btn-primary">
            {saving ? 'Saving…' : isEdit ? 'Save' : 'Add Group'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Group Header ──────────────────────────────────────────────────────────────
function GroupHeader({ group, total, homeCurrency, accountCount, isCollapsed, onToggle, onEdit, onDelete }) {
  return (
    <div className="flex items-center gap-2 px-1 py-0.5">
      <button onClick={onToggle}
        className="p-1 rounded-lg text-gray-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors shrink-0">
        {isCollapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
      </button>
      <span className="text-lg leading-none select-none">{group.icon}</span>
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex-1 min-w-0 truncate">{group.name}</h3>
      <span className="text-xs text-gray-400 bg-gray-100 dark:bg-slate-700 px-2 py-0.5 rounded-full shrink-0">
        {accountCount}
      </span>
      {total != null ? (
        <span className="text-sm font-bold text-gray-900 dark:text-white tabular-nums shrink-0">
          ≈ {fmt(total)}<span className="text-xs font-normal text-gray-400 ml-1">{homeCurrency}</span>
        </span>
      ) : (
        <span className="text-sm text-gray-400 shrink-0">—</span>
      )}
      <button onClick={onEdit}
        className="p-1.5 rounded-lg text-gray-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors">
        <Pencil size={13} />
      </button>
      <button onClick={onDelete}
        className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
        <Trash2 size={13} />
      </button>
    </div>
  );
}

// ── Account Card ─────────────────────────────────────────────────────────────
function AccountCard({ account, i, homeCurrency, convertedValue, isLiability, onHistory, onEdit, onDelete,
  isDragging, isDragOver, onGripMouseDown, cardRef }) {

  // While this card is being dragged, show a dashed placeholder in its grid slot
  if (isDragging) {
    return (
      <div ref={cardRef} className="rounded-xl border-2 border-dashed border-brand-300/60 dark:border-brand-700/40 bg-brand-50/20 dark:bg-brand-900/10" style={{ minHeight: 140 }} />
    );
  }

  return (
    <div
      ref={cardRef}
      onMouseDown={e => {
        // Don't start drag if clicking an action button
        if (e.target.closest('button')) return;
        onGripMouseDown(e);  // parent passes e => handleGripMouseDown(e, account)
      }}
      className={`card p-5 flex flex-col gap-3 transition-all duration-150 select-none cursor-grab active:cursor-grabbing
        ${isLiability ? 'border-red-100 dark:border-red-900/30' : ''}
        ${isDragOver  ? 'ring-2 ring-brand-400 dark:ring-brand-500 scale-[1.01]' : ''}
      `}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          {/* Drag handle hint */}
          <div className="text-gray-300 dark:text-slate-600 shrink-0 -ml-1">
            <GripVertical size={16} />
          </div>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
            style={{ backgroundColor: COLORS[i % COLORS.length] + '22' }}>
            {account.icon}
          </div>
          <div>
            <p className="font-semibold text-gray-900 dark:text-white text-sm leading-tight">{account.name}</p>
            <p className="text-xs text-gray-400 dark:text-slate-500">{account.currency}
              {isLiability && <span className="ml-1 text-red-400">· Liability</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onHistory}
            className="p-1.5 rounded-lg text-gray-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors" title="View history">
            <History size={13} />
          </button>
          <button onClick={onEdit}
            className="p-1.5 rounded-lg text-gray-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors" title="Edit">
            <Pencil size={13} />
          </button>
          <button onClick={onDelete}
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title="Delete">
            <Trash2 size={13} />
          </button>
        </div>
      </div>
      <div className="border-t border-gray-100 dark:border-slate-700/60 pt-3">
        {account.latest_balance !== null && account.latest_balance !== undefined ? (
          <>
            <p className={`text-2xl font-bold ${isLiability ? 'text-red-500 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
              {fmt(account.latest_balance)}
              <span className="text-sm font-normal text-gray-400 ml-1.5">{account.currency}</span>
            </p>
            {account.type === 'commodity' && account.latest_quantity != null && (
              <p className="text-xs text-brand-500 dark:text-brand-400 mt-0.5 font-medium">
                {account.latest_quantity} {account.unit} @ {fmt(account.latest_price_per_unit)} {account.currency}/{account.unit}
              </p>
            )}
            {(() => {
              const cv = convertedValue(account);
              return cv !== null
                ? <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">≈ {fmt(cv)} {homeCurrency}</p>
                : null;
            })()}
            <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">as of {account.latest_date}</p>
          </>
        ) : (
          <p className="text-sm text-gray-400 dark:text-slate-500 italic">No balance recorded yet</p>
        )}
      </div>
    </div>
  );
}

// ── Edit Balance Snapshot modal ───────────────────────────────────────────────
function EditBalanceModal({ snapshot, account, onSave, onClose }) {
  const isCommodity = account.type === 'commodity';
  const [recordedDate, setRecordedDate] = useState(snapshot.recorded_date);
  const [notes,        setNotes]        = useState(snapshot.notes ?? '');
  const [balance,      setBalance]      = useState(isCommodity ? '' : String(snapshot.balance ?? ''));
  const [quantity,     setQuantity]     = useState(String(snapshot.quantity ?? ''));
  const [pricePerUnit, setPricePerUnit] = useState(String(snapshot.price_per_unit ?? ''));
  const [saving,       setSaving]       = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { recorded_date: recordedDate, notes: notes.trim() || null };
      if (isCommodity) {
        payload.quantity = parseFloat(quantity);
        payload.price_per_unit = parseFloat(pricePerUnit);
      } else {
        payload.balance = parseFloat(balance);
      }
      await onSave(snapshot.id, payload);
      onClose();
    } finally { setSaving(false); }
  }

  return (
    <Modal open onClose={onClose} title={`Edit Snapshot — ${account.icon} ${account.name}`} size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label">Date</label>
          <input type="date" className="input" value={recordedDate}
            onChange={e => setRecordedDate(e.target.value)} required />
        </div>
        {isCommodity ? (
          <>
            <div>
              <label className="label">Quantity ({account.unit})</label>
              <input type="number" step="any" min="0" className="input"
                value={quantity} onChange={e => setQuantity(e.target.value)} required />
            </div>
            <div>
              <label className="label">Price / {account.unit} ({account.currency})</label>
              <input type="number" step="any" min="0" className="input"
                value={pricePerUnit} onChange={e => setPricePerUnit(e.target.value)} required />
            </div>
          </>
        ) : (
          <div>
            <label className="label">Balance ({account.currency})</label>
            <input type="number" step="0.01" className="input"
              value={balance} onChange={e => setBalance(e.target.value)} required />
          </div>
        )}
        <div>
          <label className="label">Notes (optional)</label>
          <input className="input" value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary flex-1">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Snapshots Table ───────────────────────────────────────────────────────────
const SNAPSHOTS_PAGE = 8;

// PostgreSQL NOW() is the same for all rows in one transaction →
// truncate to the second to use as a stable per-submission key.
function batchKey(h) {
  return (h.created_at ?? '').toString().slice(0, 19);
}

function fmtSubmitTime(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return d.toLocaleString('en', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function SnapshotsTable({ accounts, allHistories, homeCurrency, rates, onEditSnapshot, onDeleteSnapshot }) {
  const [showCount, setShowCount] = useState(SNAPSHOTS_PAGE);
  if (!allHistories.length) return null;

  const accById = Object.fromEntries(accounts.map(a => [a.id, a]));

  // Group by submission batch (created_at second), sorted newest first
  const byBatch = {};
  for (const h of allHistories) {
    const key = batchKey(h);
    if (!byBatch[key]) byBatch[key] = [];
    byBatch[key].push(h);
  }
  const batches = Object.keys(byBatch).sort((a, b) => b.localeCompare(a));

  function computeTotal(entries) {
    let total = 0, allHaveRates = true;
    for (const h of entries) {
      const acc = accById[h.account_id];
      if (!acc) continue;
      let rate = parseFloat(h.exchange_rate) || 1.0;
      if (rate === 1.0 && acc.currency !== homeCurrency) {
        const liveRate = parseFloat(rates?.rates?.[acc.currency]);
        if (!isNaN(liveRate) && liveRate > 0) rate = liveRate;
        else allHaveRates = false;
      }
      const converted = parseFloat(h.balance) / rate;
      total += acc.type === 'liability' ? -converted : converted;
    }
    return { total, allHaveRates };
  }

  const visible = batches.slice(0, showCount);

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-700/60 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Balance History</h3>
        <span className="text-xs text-gray-400 dark:text-slate-500">
          {batches.length} submission{batches.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Submission groups */}
      <div className="divide-y divide-gray-50 dark:divide-slate-700/40">
        {visible.map(key => {
          const entries = byBatch[key];
          const { total, allHaveRates } = computeTotal(entries);
          const prefix       = allHaveRates ? '≈' : '~';
          const notes        = entries.find(h => h.notes)?.notes ?? null;
          const recordedDate = entries[0]?.recorded_date ?? '';
          const submittedAt  = entries[0]?.created_at ?? '';
          const sameDay      = recordedDate === submittedAt.slice(0, 10);

          return (
            <div key={key} className="p-4 hover:bg-gray-50/60 dark:hover:bg-slate-700/20 transition-colors">
              {/* Group header */}
              <div className="flex items-start justify-between gap-2 mb-3">
                <div>
                  <p className="text-sm font-semibold text-gray-800 dark:text-white">
                    {fmtSubmitTime(submittedAt)}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-2 mt-0.5">
                    {!sameDay && (
                      <span className="text-xs text-gray-400 dark:text-slate-500">
                        For {recordedDate}
                      </span>
                    )}
                    <span className="text-xs text-gray-400 dark:text-slate-500">
                      {entries.length} account{entries.length !== 1 ? 's' : ''}
                    </span>
                    {notes && (
                      <span className="text-xs text-gray-400 dark:text-slate-500 italic">· {notes}</span>
                    )}
                  </div>
                </div>
                <p className="text-sm font-bold text-gray-900 dark:text-white tabular-nums shrink-0">
                  {prefix} {fmt(total)}
                  <span className="text-xs font-normal text-gray-400 ml-1">{homeCurrency}</span>
                </p>
              </div>

              {/* Account entries grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                {entries.map(h => {
                  const acc = accById[h.account_id];
                  if (!acc) return null;
                  return (
                    <div key={h.id}
                      className="group flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-slate-800/50 hover:bg-gray-100 dark:hover:bg-slate-700/50 transition-colors">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-base shrink-0">{acc.icon}</span>
                        <span className="text-xs text-gray-600 dark:text-slate-300 font-medium truncate">{acc.name}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-xs font-semibold text-gray-900 dark:text-white tabular-nums">
                          {fmt(h.balance)}
                          <span className="text-[10px] font-normal text-gray-400 ml-0.5">{acc.currency}</span>
                        </span>
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5 ml-1">
                          <button onClick={() => onEditSnapshot(h, acc)}
                            className="p-1 rounded text-gray-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors">
                            <Pencil size={10} />
                          </button>
                          <button onClick={() => onDeleteSnapshot(h.id)}
                            className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                            <Trash2 size={10} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Show more */}
      {batches.length > showCount && (
        <div className="px-5 py-3 border-t border-gray-100 dark:border-slate-700/60">
          <button onClick={() => setShowCount(c => c + SNAPSHOTS_PAGE)}
            className="btn-ghost w-full text-xs text-gray-400 hover:text-gray-600 dark:hover:text-slate-300">
            Show {Math.min(SNAPSHOTS_PAGE, batches.length - showCount)} more
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Accounts() {
  const api  = useApi();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [accounts,      setAccounts]      = useState([]);
  const [allHistories,  setAllHistories]  = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [showAdd,       setShowAdd]       = useState(false);
  const [editTarget,    setEditTarget]    = useState(null);
  const [recording,     setRecording]     = useState(false);
  const [historyTarget, setHistoryTarget] = useState(null);
  const [rates,             setRates]             = useState(null);
  const [ratesError,        setRatesError]        = useState(false);
  const [ratesLoaded,       setRatesLoaded]       = useState(false);
  const [accountsSettings,  setAccountsSettings]  = useState(null);
  const [editBalanceTarget, setEditBalanceTarget] = useState(null); // { snapshot, account }
  const [goals,             setGoals]             = useState([]);
  const [showAddGoal,       setShowAddGoal]       = useState(false);
  const [editGoalTarget,    setEditGoalTarget]    = useState(null);
  const [groups,            setGroups]            = useState([]);
  const [collapsedGroups,   setCollapsedGroups]   = useState({});
  const [showAddGroup,      setShowAddGroup]      = useState(false);
  const [editGroupTarget,   setEditGroupTarget]   = useState(null);
  const [dragState,         setDragState]         = useState(null); // { id, offsetX, offsetY, x, y, width }
  const [dragOverId,        setDragOverId]        = useState(null);
  const cardRefs    = useRef({});
  const dragOverRef = useRef(null); // stable ref for mouseup closure

  const fetchAccounts = useCallback(async () => {
    // Phase 1: resolve homeCurrency from persisted settings
    let resolvedCurrency = user?.currency || 'EGP';
    try {
      const s = await getSettings(api);
      setAccountsSettings(s);
      resolvedCurrency = s.accounts_currency || user?.currency || 'EGP';
    } catch { /* non-fatal — fall back to user.currency */ }

    // Phase 2: accounts + rates in parallel now that homeCurrency is known
    const [accountsResult, ratesResult] = await Promise.allSettled([
      getAccounts(api).then(async d => {
        const hists = d.accounts.length
          ? await Promise.all(d.accounts.map(a =>
              getHistory(api, a.id).then(h => h.history.map(r => ({ ...r, account_id: a.id })))
            ))
          : [];
        return { accounts: d.accounts, histories: hists.flat() };
      }),
      getRates(api, resolvedCurrency),
    ]);

    if (accountsResult.status === 'fulfilled') {
      setAccounts(accountsResult.value.accounts);
      setAllHistories(accountsResult.value.histories);
    } else {
      showToast('Failed to load accounts', 'error');
    }

    setRates(ratesResult.status === 'fulfilled' ? ratesResult.value : null);
    setRatesError(ratesResult.status === 'rejected');
    setRatesLoaded(true);
    setLoading(false);

    // Goals + Groups (non-blocking)
    getGoals(api).then(d => setGoals(d.goals)).catch(() => {});
    getAccountGroups(api).then(d => setGroups(d.groups)).catch(() => {});
  }, [api, user]);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  async function handleCreate(data) {
    try {
      const d = await createAccount(api, data);
      setAccounts(d.accounts);
      showToast('Account added');
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to create account', 'error');
      throw err;
    }
  }

  async function handleUpdate(data) {
    try {
      const d = await updateAccount(api, editTarget.id, data);
      setAccounts(d.accounts);
      showToast('Account updated');
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to update account', 'error');
      throw err;
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this account and all its balance history?')) return;
    try {
      await deleteAccount(api, id);
      setAccounts(a => a.filter(x => x.id !== id));
      setAllHistories(h => h.filter(x => x.account_id !== id));
      showToast('Account deleted');
    } catch { showToast('Failed to delete account', 'error'); }
  }

  async function handleDeleteBalance(id) {
    if (!window.confirm('Delete this balance snapshot?')) return;
    try {
      await deleteBalance(api, id);
      await fetchAccounts();
      showToast('Snapshot deleted');
    } catch { showToast('Failed to delete snapshot', 'error'); }
  }

  async function handleUpdateBalance(id, data) {
    try {
      await updateBalance(api, id, data);
      await fetchAccounts();
      showToast('Snapshot updated');
    } catch { showToast('Failed to update snapshot', 'error'); throw new Error(); }
  }

  async function handleCreateGroup(data) {
    try {
      const d = await createAccountGroup(api, data);
      setGroups(d.groups);
      showToast('Group added');
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to create group', 'error');
      throw err;
    }
  }
  async function handleUpdateGroup(data) {
    try {
      const d = await updateAccountGroup(api, editGroupTarget.id, data);
      setGroups(d.groups);
      showToast('Group updated');
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to update group', 'error');
      throw err;
    }
  }
  async function handleDeleteGroup(id) {
    if (!window.confirm('Delete this group? Accounts will be ungrouped.')) return;
    try {
      await deleteAccountGroup(api, id);
      setGroups(g => g.filter(x => x.id !== id));
      // Ungroup affected accounts in local state
      setAccounts(a => a.map(acc => acc.group_id === id ? { ...acc, group_id: null } : acc));
      showToast('Group deleted');
    } catch { showToast('Failed to delete group', 'error'); }
  }

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

  async function handleRecord(data) {
    try {
      const d = await recordBalances(api, data);
      setAccounts(d.accounts);
      // Re-fetch all histories to refresh charts
      const hists = await Promise.all(
        d.accounts.map(a =>
          getHistory(api, a.id).then(h => h.history.map(r => ({ ...r, account_id: a.id })))
        )
      );
      setAllHistories(hists.flat());
      showToast('Balances recorded');
    } catch { showToast('Failed to record balances', 'error'); throw new Error(); }
  }

  function handleGripMouseDown(e, account) {
    e.preventDefault();
    const cardEl = cardRefs.current[account.id];
    if (!cardEl) return;
    const rect = cardEl.getBoundingClientRect();
    setDragState({
      id: account.id,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      x: e.clientX,
      y: e.clientY,
      width: rect.width,
    });
    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';
  }

  useEffect(() => {
    if (!dragState) return;

    function onMouseMove(e) {
      setDragState(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : null);
      // Find which card the cursor is over (same group only)
      const draggingAccount = accounts.find(a => a.id === dragState.id);
      let found = null;
      for (const [idStr, el] of Object.entries(cardRefs.current)) {
        if (!el) continue;
        const id = parseInt(idStr);
        if (id === dragState.id) continue;
        const targetAccount = accounts.find(a => a.id === id);
        if (targetAccount?.group_id !== draggingAccount?.group_id) continue;
        const rect = el.getBoundingClientRect();
        if (e.clientX >= rect.left && e.clientX <= rect.right &&
            e.clientY >= rect.top  && e.clientY <= rect.bottom) {
          found = id;
          break;
        }
      }
      dragOverRef.current = found;
      setDragOverId(found);
    }

    function onMouseUp() {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      const targetId = dragOverRef.current;
      if (targetId && dragState.id !== targetId) {
        setAccounts(curr => {
          const newOrder = [...curr];
          const fromIdx = newOrder.findIndex(a => a.id === dragState.id);
          const toIdx   = newOrder.findIndex(a => a.id === targetId);
          if (fromIdx === -1 || toIdx === -1) return curr;
          const [moved] = newOrder.splice(fromIdx, 1);
          newOrder.splice(toIdx, 0, moved);
          reorderAccounts(api, newOrder.map((a, idx) => ({ id: a.id, sort_order: idx })))
            .catch(() => showToast('Failed to save order', 'error'));
          return newOrder;
        });
      }
      setDragState(null);
      setDragOverId(null);
      dragOverRef.current = null;
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup',   onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup',   onMouseUp);
    };
  }, [dragState, api]);

  if (loading) return (
    <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>
  );

  const homeCurrency      = accountsSettings?.accounts_currency || user?.currency || 'EGP';
  const withBalance       = accounts.filter(a => a.latest_balance !== null && a.latest_balance !== undefined);
  const assetAccounts     = accounts.filter(a => a.type !== 'liability');
  const liabilityAccounts = accounts.filter(a => a.type === 'liability');

  function convertedSum(list) {
    if (!ratesLoaded || ratesError || !rates?.rates) return null;
    return list.reduce((sum, a) => {
      const bal = parseFloat(a.latest_balance);
      if (isNaN(bal)) return sum;
      if (a.currency === homeCurrency) return sum + bal;
      const rate = parseFloat(rates.rates[a.currency]);
      return (!isNaN(rate) && rate > 0) ? sum + bal / rate : sum;
    }, 0);
  }
  const totalAssets      = convertedSum(assetAccounts.filter(a => a.latest_balance != null));
  const totalLiabilities = convertedSum(liabilityAccounts.filter(a => a.latest_balance != null));
  const netWorthVal      = totalAssets != null && totalLiabilities != null
    ? totalAssets - totalLiabilities : null;

  const convertedValue = (account) => {
    if (!rates?.rates || ratesError || account.latest_balance == null) return null;
    if (account.currency === homeCurrency) return null;
    const bal  = parseFloat(account.latest_balance);
    const rate = parseFloat(rates.rates[account.currency]);
    return (!isNaN(bal) && !isNaN(rate) && rate > 0) ? bal / rate : null;
  };

  const ratesUpdatedAt = rates?.fetchedAt
    ? new Date(rates.fetchedAt).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Wallet size={20} className="text-brand-500" /> Accounts
          </h2>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">
            Track your account balances over time
          </p>
        </div>
        <div className="flex gap-2">
          {accounts.length > 0 && (
            <button onClick={() => navigate('/app/accounts/record')} className="btn-primary">
              <ClipboardList size={14} /> Record Balances
            </button>
          )}
          <button onClick={() => setShowAddGroup(true)} className="btn-secondary">
            <FolderOpen size={14} /> Add Group
          </button>
          <button onClick={() => setShowAdd(true)} className="btn-secondary">
            <Plus size={14} /> Add Account
          </button>
        </div>
      </div>

      {/* Net Worth banner */}
      {withBalance.length > 0 && (
        <div className="card p-4 bg-gradient-to-br from-brand-600 to-indigo-700 border-0">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-brand-200 mb-0.5">Total Assets</p>
              <p className="text-xl font-bold text-white">
                {!ratesLoaded ? '—' : totalAssets != null
                  ? `≈ ${fmt(totalAssets)}`
                  : fmt(assetAccounts.reduce((s, a) => s + (a.latest_balance ?? 0), 0))}
                <span className="text-xs font-normal text-brand-300 ml-1">{homeCurrency}</span>
              </p>
            </div>
            <div>
              <p className="text-xs text-red-300 mb-0.5">Total Liabilities</p>
              <p className="text-xl font-bold text-red-200">
                {!ratesLoaded ? '—' : totalLiabilities != null
                  ? `≈ ${fmt(totalLiabilities)}`
                  : fmt(liabilityAccounts.reduce((s, a) => s + (a.latest_balance ?? 0), 0))}
                <span className="text-xs font-normal text-red-300 ml-1">{homeCurrency}</span>
              </p>
            </div>
            <div>
              <p className="text-xs text-brand-200 mb-0.5">Net Worth</p>
              <p className={`text-xl font-bold ${netWorthVal != null && netWorthVal >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                {netWorthVal != null ? `≈ ${fmt(netWorthVal)}` : '—'}
                <span className="text-xs font-normal text-brand-300 ml-1">{homeCurrency}</span>
              </p>
            </div>
          </div>
          {ratesError && (
            <p className="text-xs text-amber-300 mt-2">Exchange rates unavailable — balances shown as-is</p>
          )}
          {ratesUpdatedAt && !ratesError && (
            <p className="text-xs text-brand-300 mt-2">Rates updated today at {ratesUpdatedAt}{rates?.cached ? ' (cached)' : ''}</p>
          )}
        </div>
      )}

      {/* Account cards */}
      {!accounts.length ? (
        <div className="card p-10">
          <EmptyState icon="🏦" title="No accounts yet"
            description="Add your bank accounts, wallets, or cash to start tracking balances" />
        </div>
      ) : (
        <div className="space-y-5">
          {/* Named groups */}
          {groups.map(group => {
            const groupAccounts   = accounts.filter(a => a.group_id === group.id);
            const gAssets         = groupAccounts.filter(a => a.type !== 'liability');
            const gLiabilities    = groupAccounts.filter(a => a.type === 'liability');
            const ta              = convertedSum(gAssets.filter(a => a.latest_balance != null));
            const tl              = convertedSum(gLiabilities.filter(a => a.latest_balance != null));
            const groupTotal      = (ta != null || tl != null) ? (ta ?? 0) - (tl ?? 0) : null;
            const isCollapsed     = !!collapsedGroups[group.id];
            return (
              <div key={group.id} className="space-y-3">
                <GroupHeader
                  group={group}
                  total={groupTotal}
                  homeCurrency={homeCurrency}
                  accountCount={groupAccounts.length}
                  isCollapsed={isCollapsed}
                  onToggle={() => setCollapsedGroups(c => ({ ...c, [group.id]: !c[group.id] }))}
                  onEdit={() => setEditGroupTarget(group)}
                  onDelete={() => handleDeleteGroup(group.id)}
                />
                {!isCollapsed && groupAccounts.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {groupAccounts.map((account, i) => (
                      <AccountCard key={account.id} account={account} i={i}
                        homeCurrency={homeCurrency} convertedValue={convertedValue}
                        isLiability={account.type === 'liability'}
                        onHistory={() => setHistoryTarget(account)}
                        onEdit={() => setEditTarget(account)}
                        onDelete={() => handleDelete(account.id)}
                        isDragging={dragState?.id === account.id}
                        isDragOver={dragOverId === account.id}
                        onGripMouseDown={e => handleGripMouseDown(e, account)}
                        cardRef={el => { cardRefs.current[account.id] = el; }} />
                    ))}
                  </div>
                )}
                {!isCollapsed && groupAccounts.length === 0 && (
                  <p className="text-sm text-gray-400 dark:text-slate-500 italic px-1">No accounts in this group yet</p>
                )}
              </div>
            );
          })}

          {/* Ungrouped accounts */}
          {(() => {
            const ungrouped    = accounts.filter(a => !a.group_id);
            const ugAssets     = ungrouped.filter(a => a.type !== 'liability');
            const ugLiabilities= ungrouped.filter(a => a.type === 'liability');
            if (!ungrouped.length) return null;
            return (
              <div className="space-y-3">
                {groups.length > 0 && (
                  <div className="flex items-center gap-2 px-1">
                    <h3 className="text-sm font-semibold text-gray-500 dark:text-slate-400">Ungrouped</h3>
                    <span className="text-xs text-gray-400">({ungrouped.length})</span>
                  </div>
                )}
                {ugAssets.length > 0 && (
                  <>
                    {ugLiabilities.length > 0 && groups.length === 0 && (
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300">Assets</h3>
                        <span className="text-xs text-gray-400">({ugAssets.length})</span>
                      </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {ugAssets.map((account, i) => (
                        <AccountCard key={account.id} account={account} i={i}
                          homeCurrency={homeCurrency} convertedValue={convertedValue}
                          onHistory={() => setHistoryTarget(account)}
                          onEdit={() => setEditTarget(account)}
                          onDelete={() => handleDelete(account.id)}
                          isDragging={dragState?.id === account.id}
                          isDragOver={dragOverId === account.id}
                          onGripMouseDown={e => handleGripMouseDown(e, account)}
                          cardRef={el => { cardRefs.current[account.id] = el; }} />
                      ))}
                    </div>
                  </>
                )}
                {ugLiabilities.length > 0 && (
                  <>
                    {groups.length === 0 && (
                      <div className="flex items-center gap-2 mt-1">
                        <h3 className="text-sm font-semibold text-red-600 dark:text-red-400">Liabilities</h3>
                        <span className="text-xs text-gray-400">({ugLiabilities.length})</span>
                      </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {ugLiabilities.map((account, i) => (
                        <AccountCard key={account.id} account={account} i={i + ugAssets.length}
                          homeCurrency={homeCurrency} convertedValue={convertedValue}
                          isLiability
                          onHistory={() => setHistoryTarget(account)}
                          onEdit={() => setEditTarget(account)}
                          onDelete={() => handleDelete(account.id)}
                          isDragging={dragState?.id === account.id}
                          isDragOver={dragOverId === account.id}
                          onGripMouseDown={e => handleGripMouseDown(e, account)}
                          cardRef={el => { cardRefs.current[account.id] = el; }} />
                      ))}
                    </div>
                  </>
                )}
              </div>
            );
          })()}
        </div>
      )}


      {/* Snapshots Table */}
      {allHistories.length > 0 && (
        <SnapshotsTable
          accounts={accounts}
          allHistories={allHistories}
          homeCurrency={homeCurrency}
          rates={rates}
          onEditSnapshot={(h, acc) => setEditBalanceTarget({ snapshot: h, account: acc })}
          onDeleteSnapshot={handleDeleteBalance}
        />
      )}

      {/* Goals */}
      <GoalsSection
        goals={goals}
        accounts={accounts}
        onAdd={() => setShowAddGoal(true)}
        onEdit={g => setEditGoalTarget(g)}
        onDelete={handleDeleteGoal}
      />

      {/* Modals */}
      {showAdd && (
        <AccountFormModal defaultCurrency={user?.currency} groups={groups}
          onSave={handleCreate} onClose={() => setShowAdd(false)} />
      )}
      {editTarget && (
        <AccountFormModal account={editTarget} defaultCurrency={user?.currency} groups={groups}
          onSave={handleUpdate} onClose={() => setEditTarget(null)} />
      )}
      {historyTarget && (
        <HistoryModal account={historyTarget} api={api} onClose={() => setHistoryTarget(null)} />
      )}
      {editBalanceTarget && (
        <EditBalanceModal
          snapshot={editBalanceTarget.snapshot}
          account={editBalanceTarget.account}
          onSave={handleUpdateBalance}
          onClose={() => setEditBalanceTarget(null)}
        />
      )}
      {showAddGoal && (
        <GoalFormModal accounts={accounts} defaultCurrency={homeCurrency}
          onSave={handleCreateGoal} onClose={() => setShowAddGoal(false)} />
      )}
      {editGoalTarget && (
        <GoalFormModal goal={editGoalTarget} accounts={accounts} defaultCurrency={homeCurrency}
          onSave={handleUpdateGoal} onClose={() => setEditGoalTarget(null)} />
      )}
      {showAddGroup && (
        <GroupFormModal onSave={handleCreateGroup} onClose={() => setShowAddGroup(false)} />
      )}
      {editGroupTarget && (
        <GroupFormModal group={editGroupTarget} onSave={handleUpdateGroup}
          onClose={() => setEditGroupTarget(null)} />
      )}

      {/* Floating drag card — follows mouse during custom drag */}
      {dragState && (() => {
        const dragging = accounts.find(a => a.id === dragState.id);
        if (!dragging) return null;
        const di = accounts.findIndex(a => a.id === dragState.id);
        const isLiab = dragging.type === 'liability';
        const cv = convertedValue(dragging);
        return (
          <div
            style={{
              position: 'fixed',
              left: dragState.x - dragState.offsetX,
              top:  dragState.y - dragState.offsetY,
              width: dragState.width,
              zIndex: 9999,
              pointerEvents: 'none',
              transform: 'rotate(2deg) scale(1.04)',
            }}
            className="card p-5 flex flex-col gap-3 shadow-2xl shadow-brand-500/25 ring-2 ring-brand-400 dark:ring-brand-500"
          >
            <div className="flex items-center gap-3">
              <div className="text-gray-300 dark:text-slate-600 shrink-0 -ml-1">
                <GripVertical size={16} />
              </div>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
                style={{ backgroundColor: COLORS[di % COLORS.length] + '22' }}>
                {dragging.icon}
              </div>
              <div>
                <p className="font-semibold text-gray-900 dark:text-white text-sm leading-tight">{dragging.name}</p>
                <p className="text-xs text-gray-400 dark:text-slate-500">{dragging.currency}
                  {isLiab && <span className="ml-1 text-red-400">· Liability</span>}
                </p>
              </div>
            </div>
            <div className="border-t border-gray-100 dark:border-slate-700/60 pt-3">
              {dragging.latest_balance != null ? (
                <>
                  <p className={`text-2xl font-bold ${isLiab ? 'text-red-500 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
                    {fmt(dragging.latest_balance)}
                    <span className="text-sm font-normal text-gray-400 ml-1.5">{dragging.currency}</span>
                  </p>
                  {cv !== null && (
                    <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">≈ {fmt(cv)} {homeCurrency}</p>
                  )}
                  <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">as of {dragging.latest_date}</p>
                </>
              ) : (
                <p className="text-sm text-gray-400 dark:text-slate-500 italic">No balance recorded yet</p>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
