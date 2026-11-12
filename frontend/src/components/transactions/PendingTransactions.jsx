import { useState } from 'react';
import { Check, X, Pencil, ArrowUpRight, ArrowDownLeft, Inbox } from 'lucide-react';
import { confirmPending, rejectPending } from '../../api/pendingApi';
import { showToast } from '../common/Toast';
import EmptyState from '../common/EmptyState';
import Modal from '../common/Modal';
import Spinner from '../common/Spinner';

const INCOME_SOURCES = ['Salary', 'Business', 'Freelance', 'Investment', 'Rental', 'Gift', 'Other'];

const money = (n) => Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });

// SMS-derived transactions waiting for a human yes/no. `pending` is owned by the
// Transactions page (it also needs the count for the tab badge); `onChange` tells
// it to refetch, and passes the confirmed type so the right list can refresh.
export default function PendingTransactions({ api, pending, categories, onChange }) {
  const [busyId, setBusyId]   = useState(null);
  const [editing, setEditing] = useState(null); // { id, type, amount, currency, date, description, category, source }

  async function confirm(row, edits = {}) {
    setBusyId(row.id);
    try {
      const res = await confirmPending(api, row.id, edits);
      showToast(res.type === 'income' ? 'Income saved' : 'Expense saved');
      setEditing(null);
      onChange(res.type);
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to save', 'error');
      onChange(null);
    }
    setBusyId(null);
  }

  async function reject(row) {
    setBusyId(row.id);
    try { await rejectPending(api, row.id); showToast('Dismissed'); onChange(null); }
    catch (err) { showToast(err.response?.data?.error || 'Failed to dismiss', 'error'); onChange(null); }
    setBusyId(null);
  }

  function openEdit(row) {
    setEditing({
      id: row.id, type: row.type, amount: String(row.amount), currency: row.currency, date: row.date,
      description: row.description || '', category: row.category || '', source: row.source || 'Other',
    });
  }

  function submitEdit(e) {
    e.preventDefault();
    const f = editing;
    confirm({ id: f.id }, {
      type: f.type, amount: Number(f.amount), currency: f.currency, date: f.date, description: f.description,
      ...(f.type === 'income' ? { source: f.source } : { category: f.category || undefined }),
    });
  }

  if (!pending.length) {
    return (
      <div className="card">
        <EmptyState
          icon={<Inbox size={32} />}
          title="Nothing waiting for review"
          description="Transactions parsed from your SMS webhook show up here until you confirm them"
        />
      </div>
    );
  }

  const set = (k, v) => setEditing(p => ({ ...p, [k]: v }));

  return (
    <div className="space-y-3">
      {pending.map(row => {
        const isIncome = row.type === 'income';
        const busy = busyId === row.id;
        return (
          <div key={row.id} className="card p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                isIncome ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600' : 'bg-red-50 dark:bg-red-900/20 text-red-500'}`}>
                {isIncome ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 dark:text-white text-sm truncate">
                  {row.description || 'SMS transaction'}
                  <span className={`ml-2 align-middle text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full ${
                    isIncome ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                             : 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'}`}>
                    {isIncome ? 'Income' : 'Expense'}
                  </span>
                </p>
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                  {row.date} · {isIncome ? (row.source || 'Other') : (row.category || 'Uncategorized → Other')}
                </p>
              </div>
              <p className={`font-bold shrink-0 ${isIncome ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-900 dark:text-white'}`}>
                {isIncome ? '+' : '−'}{money(row.amount)} <span className="text-xs font-normal text-gray-400">{row.currency}</span>
              </p>
            </div>

            <details className="text-xs text-gray-400 dark:text-slate-500">
              <summary className="cursor-pointer select-none hover:text-gray-600 dark:hover:text-slate-300">Original SMS</summary>
              <p className="mt-1.5 p-2 rounded-lg bg-gray-50 dark:bg-slate-700/30 whitespace-pre-wrap break-words" dir="auto">{row.raw_text}</p>
            </details>

            <div className="flex gap-2">
              <button onClick={() => confirm(row)} disabled={busy} className="btn-primary flex-1 justify-center">
                {busy ? <Spinner size="sm" /> : <Check size={14} />} Confirm
              </button>
              <button onClick={() => openEdit(row)} disabled={busy} className="btn-secondary"><Pencil size={13} /> Edit</button>
              <button onClick={() => reject(row)} disabled={busy} className="btn-secondary" title="Dismiss"><X size={14} /></button>
            </div>
          </div>
        );
      })}

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Review transaction" size="sm">
        {editing && (
          <form onSubmit={submitEdit} className="space-y-4">
            <div className="flex gap-0.5 p-0.5 bg-gray-100 dark:bg-slate-700/60 rounded-xl">
              {['expense', 'income'].map(t => (
                <button type="button" key={t} onClick={() => set('type', t)}
                  className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${
                    editing.type === t ? 'bg-white dark:bg-slate-800 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-slate-400'}`}>
                  {t}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Amount</label>
                <input type="number" className="input" required min="0.01" step="0.01" value={editing.amount} onChange={e => set('amount', e.target.value)} />
              </div>
              <div>
                <label className="label">Currency</label>
                <input className="input" required maxLength={3} value={editing.currency} onChange={e => set('currency', e.target.value.toUpperCase())} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Date</label>
                <input type="date" className="input" required value={editing.date} onChange={e => set('date', e.target.value)} />
              </div>
              <div>
                <label className="label">{editing.type === 'income' ? 'Source' : 'Category'}</label>
                {editing.type === 'income' ? (
                  <select className="input" value={editing.source} onChange={e => set('source', e.target.value)}>
                    {INCOME_SOURCES.map(s => <option key={s}>{s}</option>)}
                  </select>
                ) : (
                  <select className="input" value={editing.category} onChange={e => set('category', e.target.value)}>
                    <option value="">Other</option>
                    {categories.map(c => <option key={c.id}>{c.name}</option>)}
                  </select>
                )}
              </div>
            </div>
            <div>
              <label className="label">Description</label>
              <input className="input" value={editing.description} onChange={e => set('description', e.target.value)} />
            </div>
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setEditing(null)} className="btn-secondary flex-1">Cancel</button>
              <button type="submit" disabled={busyId === editing.id} className="btn-primary flex-1">
                {busyId === editing.id ? <Spinner size="sm" /> : 'Save'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
