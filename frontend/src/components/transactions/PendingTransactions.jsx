import { useState } from 'react';
import { Check, X, Pencil, ArrowUpRight, ArrowDownLeft, Inbox, MessageSquare } from 'lucide-react';
import { confirmPending, rejectPending } from '../../api/pendingApi';
import { showToast } from '../common/Toast';
import EmptyState from '../common/EmptyState';
import Modal from '../common/Modal';
import Spinner from '../common/Spinner';

const INCOME_SOURCES = ['Salary', 'Business', 'Freelance', 'Investment', 'Rental', 'Gift', 'Other'];

const money = (n) => Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });

function Field({ label, children }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500">{label}</dt>
      <dd className="text-sm text-gray-800 dark:text-slate-200 mt-0.5 break-words">{children}</dd>
    </div>
  );
}

// Toggle chips rather than the dropdown BucketPicker: a popover gets clipped inside a
// scrolling modal, and here the choice is the whole point of the prompt.
function BucketChips({ buckets, value, onChange }) {
  const toggle = (id) => onChange(value.includes(id) ? value.filter(x => x !== id) : [...value, id]);
  return (
    <div className="flex flex-wrap gap-2">
      {buckets.map(b => {
        const on = value.includes(b.id);
        return (
          <button type="button" key={b.id} onClick={() => toggle(b.id)} aria-pressed={on}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              on ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300'
                 : 'border-gray-200 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700/50'}`}>
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: b.color || '#7c3aed' }} />
            {b.icon && <span>{b.icon}</span>}{b.name}
            {on && <Check size={11} />}
          </button>
        );
      })}
    </div>
  );
}

// SMS-derived transactions waiting for a human yes/no. `pending` is owned by the
// Transactions page (it also needs the count for the tab badge); `onChange` tells
// it to refetch, and passes the confirmed type so the right list can refresh.
export default function PendingTransactions({ api, pending, categories, buckets = [], onChange }) {
  const [busyId, setBusyId]       = useState(null);
  const [editing, setEditing]     = useState(null); // { id, type, amount, currency, date, description, category, source, bucketIds }
  const [bucketAsk, setBucketAsk] = useState(null); // { row, bucketIds } — "assign a bucket?" step before saving an expense

  async function confirm(row, edits = {}) {
    setBusyId(row.id);
    try {
      const res = await confirmPending(api, row.id, edits);
      if (res.buckets_assigned === false) showToast('Expense saved, but the bucket could not be assigned', 'warning');
      else showToast(res.type === 'income' ? 'Income saved' : 'Expense saved');
      setEditing(null);
      setBucketAsk(null);
      onChange(res.type);
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to save', 'error');
      onChange(null);
    }
    setBusyId(null);
  }

  // Buckets only exist for expenses, so an income — or a user with no buckets yet —
  // is saved straight away instead of being asked a question that has no answer.
  function startConfirm(row) {
    if (row.type === 'expense' && buckets.length) setBucketAsk({ row, bucketIds: [] });
    else confirm(row);
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
      description: row.description || '', category: row.category || '', source: row.source || 'Other', bucketIds: [],
    });
  }

  function submitEdit(e) {
    e.preventDefault();
    const f = editing;
    confirm({ id: f.id }, {
      type: f.type, amount: Number(f.amount), currency: f.currency, date: f.date, description: f.description,
      ...(f.type === 'income' ? { source: f.source } : { category: f.category || undefined, bucketIds: f.bucketIds }),
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
              </div>
              <p className={`font-bold shrink-0 ${isIncome ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-900 dark:text-white'}`}>
                {isIncome ? '+' : '−'}{money(row.amount)} <span className="text-xs font-normal text-gray-400">{row.currency}</span>
              </p>
            </div>

            {/* Everything the parser decided, visible without opening Edit */}
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3 py-3 border-y border-gray-100 dark:border-slate-700/60">
              <Field label="Type">{isIncome ? 'Income' : 'Expense'}</Field>
              <Field label="Date">{row.date}</Field>
              {isIncome
                ? <Field label="Source">{row.source || 'Other'}</Field>
                : <Field label="Category">
                    {row.category || <span className="text-gray-400 dark:text-slate-500">None found → saved as Other</span>}
                  </Field>}
              <Field label="Currency">{row.currency}</Field>
              <div className="col-span-2 sm:col-span-4">
                <Field label="Description">
                  {row.description || <span className="text-gray-400 dark:text-slate-500">None</span>}
                </Field>
              </div>
            </dl>

            <div className="rounded-lg bg-gray-50 dark:bg-slate-700/30 px-3 py-2">
              <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500">
                <MessageSquare size={10} /> Original SMS
              </p>
              <p className="text-xs text-gray-600 dark:text-slate-300 mt-1 whitespace-pre-wrap break-words" dir="auto">{row.raw_text}</p>
            </div>

            <div className="flex gap-2">
              <button onClick={() => startConfirm(row)} disabled={busy} className="btn-primary flex-1 justify-center">
                {busy ? <Spinner size="sm" /> : <Check size={14} />} Confirm
              </button>
              <button onClick={() => openEdit(row)} disabled={busy} className="btn-secondary"><Pencil size={13} /> Edit</button>
              <button onClick={() => reject(row)} disabled={busy} className="btn-secondary" title="Dismiss"><X size={14} /></button>
            </div>
          </div>
        );
      })}

      {/* Asked when confirming an expense: which bucket(s) does it belong to? */}
      <Modal open={!!bucketAsk} onClose={() => setBucketAsk(null)} title="Assign to a bucket?" size="sm">
        {bucketAsk && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-slate-300">
              <span className="font-semibold text-gray-900 dark:text-white">{bucketAsk.row.description || 'This expense'}</span>
              {' · '}{money(bucketAsk.row.amount)} {bucketAsk.row.currency}
            </p>
            <BucketChips buckets={buckets} value={bucketAsk.bucketIds}
              onChange={ids => setBucketAsk(p => ({ ...p, bucketIds: ids }))} />
            <p className="text-xs text-gray-400 dark:text-slate-500">Optional — you can pick several, or none.</p>
            <div className="flex gap-3 pt-1">
              <button type="button" disabled={busyId === bucketAsk.row.id} className="btn-secondary flex-1 justify-center"
                onClick={() => confirm(bucketAsk.row)}>
                No bucket
              </button>
              <button type="button" disabled={busyId === bucketAsk.row.id} className="btn-primary flex-1 justify-center"
                onClick={() => confirm(bucketAsk.row, { bucketIds: bucketAsk.bucketIds })}>
                {busyId === bucketAsk.row.id ? <Spinner size="sm" />
                  : bucketAsk.bucketIds.length ? `Confirm · ${bucketAsk.bucketIds.length} bucket${bucketAsk.bucketIds.length > 1 ? 's' : ''}` : 'Confirm'}
              </button>
            </div>
          </div>
        )}
      </Modal>

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
            {editing.type === 'expense' && buckets.length > 0 && (
              <div>
                <label className="label">Buckets <span className="font-normal text-gray-400">(optional)</span></label>
                <BucketChips buckets={buckets} value={editing.bucketIds} onChange={ids => set('bucketIds', ids)} />
              </div>
            )}
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
