import { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, History, Wallet, ClipboardList } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import useApi from '../hooks/useApi';
import useAuth from '../hooks/useAuth';
import Modal from '../components/common/Modal';
import Spinner from '../components/common/Spinner';
import EmptyState from '../components/common/EmptyState';
import { showToast } from '../components/common/Toast';
import {
  getAccounts, createAccount, updateAccount, deleteAccount,
  getHistory, recordBalances, getRates, updateBalance, deleteBalance,
} from '../api/accountsApi';
import { getGoals, createGoal, updateGoal, deleteGoal } from '../api/goalsApi';
import { getSettings } from '../api/settingsApi';

const ICONS      = ['🏦', '💵', '💳', '🏧', '💰', '📱', '🏠', '💼'];
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

const tooltipStyle = {
  contentStyle: { background: '#1e1b4b', border: '1px solid #4c1d95', borderRadius: 10, color: '#e0d7ff', fontSize: 12 },
  itemStyle:    { color: '#c4b5fd' },
  labelStyle:   { color: '#a78bfa', fontWeight: 600 },
};

function buildTrendData(accounts, allHistories, homeCurrency, rates) {
  if (!allHistories.length) return [];
  const byDate = {};
  for (const h of allHistories) {
    if (!byDate[h.recorded_date]) byDate[h.recorded_date] = [];
    byDate[h.recorded_date].push(h);
  }
  const dates = Object.keys(byDate).sort();
  return dates.map(date => {
    let assets = 0, liabilities = 0;
    for (const h of byDate[date]) {
      const acc = accounts.find(a => a.id === h.account_id);
      if (!acc) continue;
      let rate = parseFloat(h.exchange_rate) || 1.0;
      if (rate === 1.0 && acc.currency !== homeCurrency) {
        rate = parseFloat(rates?.rates?.[acc.currency]) || 1.0;
      }
      const converted = parseFloat(h.balance) / rate;
      if (acc.type === 'liability') liabilities += converted;
      else assets += converted;
    }
    return { date, total: assets - liabilities, assets, liabilities };
  });
}

// ── Add / Edit modal ──────────────────────────────────────────────────────────
function AccountFormModal({ account, defaultCurrency, onSave, onClose }) {
  const isEdit = !!account;
  const [name,     setName]     = useState(account?.name     ?? '');
  const [currency, setCurrency] = useState(account?.currency ?? defaultCurrency ?? 'EGP');
  const [icon,     setIcon]     = useState(account?.icon     ?? '🏦');
  const [type,     setType]     = useState(account?.type     ?? 'monetary');
  const [unit,     setUnit]     = useState(account?.unit     ?? 'g');
  const [saving,   setSaving]   = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({ name: name.trim(), currency, icon, type, unit: type === 'commodity' ? unit : null });
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

// ── Account Card ─────────────────────────────────────────────────────────────
function AccountCard({ account, i, homeCurrency, convertedValue, isLiability, onHistory, onEdit, onDelete }) {
  return (
    <div className={`card p-5 flex flex-col gap-3 ${isLiability ? 'border-red-100 dark:border-red-900/30' : ''}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
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
function SnapshotsTable({ accounts, allHistories, homeCurrency, rates, onEditSnapshot, onDeleteSnapshot }) {
  if (!allHistories.length) return null;

  const byDate = {};
  for (const h of allHistories) {
    if (!byDate[h.recorded_date]) byDate[h.recorded_date] = [];
    byDate[h.recorded_date].push(h);
  }
  const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

  const usedIds = new Set(allHistories.map(h => h.account_id));
  const cols    = accounts.filter(a => usedIds.has(a.id));

  function computeRow(entries) {
    const entryMap = Object.fromEntries(entries.map(h => [h.account_id, h]));
    let total = 0;
    let allHaveRates = true;
    for (const acc of cols) {
      const h = entryMap[acc.id];
      if (!h) continue;
      // Use stored rate; fall back to live rate for old records (stored as 1.0 default)
      let rate = h.exchange_rate ?? 1.0;
      const isOldRecord = rate === 1.0 && acc.currency !== homeCurrency;
      if (isOldRecord) {
        const liveRate = rates?.rates?.[acc.currency];
        if (liveRate) { rate = liveRate; } else { allHaveRates = false; }
      }
      total += h.balance / rate;
    }
    return { total, allHaveRates, entryMap };
  }

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-700/60">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Snapshots</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-slate-700/40 border-b border-gray-100 dark:border-slate-700">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap">Date</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap">Notes</th>
              {cols.map(a => (
                <th key={a.id} className="px-4 py-3 text-right text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  {a.icon} {a.name} ({a.currency})
                </th>
              ))}
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap">
                Total ({homeCurrency})
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-slate-700/50">
            {dates.map(date => {
              const { total, allHaveRates, entryMap } = computeRow(byDate[date]);
              const prefix = allHaveRates ? '≈' : '~';
              const notes  = byDate[date].find(h => h.notes)?.notes ?? null;
              return (
                <tr key={date} className="hover:bg-gray-50 dark:hover:bg-slate-700/30 transition-colors">
                  <td className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 whitespace-nowrap">{date}</td>
                  <td className="px-4 py-3 text-xs text-gray-400 dark:text-slate-500 whitespace-nowrap">{notes ?? '—'}</td>
                  {cols.map(a => {
                    const h = entryMap[a.id];
                    return (
                      <td key={a.id} className="px-4 py-3 text-right whitespace-nowrap">
                        {h ? (
                          <div className="flex items-center justify-end gap-1.5 group">
                            <span className="font-medium text-gray-900 dark:text-white">
                              {fmt(h.balance)}<span className="text-xs font-normal text-gray-400 ml-1">{a.currency}</span>
                            </span>
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5">
                              <button onClick={() => onEditSnapshot(h, a)}
                                className="p-1 rounded text-gray-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors">
                                <Pencil size={11} />
                              </button>
                              <button onClick={() => onDeleteSnapshot(h.id)}
                                className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                                <Trash2 size={11} />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <span className="text-gray-300 dark:text-slate-600">—</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-4 py-3 text-right whitespace-nowrap font-semibold text-gray-900 dark:text-white">
                    {prefix} {fmt(total)}<span className="text-xs font-normal text-gray-400 ml-1">{homeCurrency}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Accounts() {
  const api  = useApi();
  const { user } = useAuth();
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

    // Goals (non-blocking)
    getGoals(api).then(d => setGoals(d.goals)).catch(() => {});
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
            <button onClick={() => setRecording(true)} className="btn-primary">
              <ClipboardList size={14} /> Record Balances
            </button>
          )}
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
        <>
          {/* Assets */}
          {assetAccounts.length > 0 && (
            <>
              {liabilityAccounts.length > 0 && (
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300">Assets</h3>
                  <span className="text-xs text-gray-400">({assetAccounts.length})</span>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {assetAccounts.map((account, i) => (
                  <AccountCard key={account.id} account={account} i={i}
                    homeCurrency={homeCurrency} convertedValue={convertedValue}
                    onHistory={() => setHistoryTarget(account)}
                    onEdit={() => setEditTarget(account)}
                    onDelete={() => handleDelete(account.id)} />
                ))}
              </div>
            </>
          )}
          {/* Liabilities */}
          {liabilityAccounts.length > 0 && (
            <>
              <div className="flex items-center gap-2 mt-1">
                <h3 className="text-sm font-semibold text-red-600 dark:text-red-400">Liabilities</h3>
                <span className="text-xs text-gray-400">({liabilityAccounts.length})</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {liabilityAccounts.map((account, i) => (
                  <AccountCard key={account.id} account={account} i={i + assetAccounts.length}
                    homeCurrency={homeCurrency} convertedValue={convertedValue}
                    isLiability
                    onHistory={() => setHistoryTarget(account)}
                    onEdit={() => setEditTarget(account)}
                    onDelete={() => handleDelete(account.id)} />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* Net Worth Trend */}
      {allHistories.length >= 2 && (() => {
        const trendData = buildTrendData(accounts, allHistories, homeCurrency, rates);
        return (
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Net Worth Trend</h3>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={trendData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="nwGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#7c3aed" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" strokeOpacity={0.5} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={d => d.slice(5)} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={fmtK} width={56} />
                <Tooltip {...tooltipStyle}
                  formatter={v => [`≈ ${fmt(v)} ${homeCurrency}`, 'Total']}
                  labelFormatter={l => `Date: ${l}`} />
                <Area type="monotone" dataKey="total" stroke="#7c3aed" strokeWidth={2.5}
                  fill="url(#nwGrad)" dot={{ r: 4, fill: '#7c3aed', strokeWidth: 0 }}
                  activeDot={{ r: 6, fill: '#7c3aed' }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        );
      })()}

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
        <AccountFormModal defaultCurrency={user?.currency}
          onSave={handleCreate} onClose={() => setShowAdd(false)} />
      )}
      {editTarget && (
        <AccountFormModal account={editTarget} defaultCurrency={user?.currency}
          onSave={handleUpdate} onClose={() => setEditTarget(null)} />
      )}
      {recording && (
        <RecordModal
          accounts={accounts}
          rates={rates}
          homeCurrency={homeCurrency}
          onSave={handleRecord}
          onClose={() => setRecording(false)}
        />
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
    </div>
  );
}
