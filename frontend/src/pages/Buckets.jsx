import { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, CartesianGrid,
} from 'recharts';
import { Boxes, Plus, Pencil, Trash2, Save, Info } from 'lucide-react';
import useApi from '../hooks/useApi';
import useAuth from '../hooks/useAuth';
import { showToast } from '../components/common/Toast';
import Spinner from '../components/common/Spinner';
import EmptyState from '../components/common/EmptyState';
import Modal from '../components/common/Modal';
import BucketPicker from '../components/common/BucketPicker';
import {
  getBuckets, createBucket, updateBucket, deleteBucket,
  getBucketBreakdown, getBucketTrend, setExpenseBuckets,
} from '../api/bucketsApi';
import { getExpenses } from '../api/expensesApi';

const COLORS = ['#7c3aed', '#f97316', '#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#6366f1', '#14b8a6', '#6b7280'];
const ICON_CHOICES = ['🪣', '✈️', '🏠', '🎁', '🧾', '🎓', '🚗', '💍', '🏖️', '👶', '🐾', '🍽️', '💊', '🎉'];

function iso(d) { return d.toISOString().split('T')[0]; }
function monthStart() { const d = new Date(); return iso(new Date(d.getFullYear(), d.getMonth(), 1)); }
function today() { return iso(new Date()); }
function fmt(n) { return Number(n || 0).toLocaleString('en', { maximumFractionDigits: 0 }); }

const tooltipStyle = {
  contentStyle: { background: '#1e1b4b', border: '1px solid #4c1d95', borderRadius: 10, color: '#e0d7ff', fontSize: 12 },
  itemStyle: { color: '#c4b5fd' },
  labelStyle: { color: '#a78bfa', fontWeight: 600 },
};

/* ── Create / edit bucket modal ─────────────────────────────── */
function BucketFormModal({ bucket, currency, onSave, onClose }) {
  const isEdit = !!bucket;
  const [name, setName] = useState(bucket?.name ?? '');
  const [icon, setIcon] = useState(bucket?.icon ?? '🪣');
  const [color, setColor] = useState(bucket?.color ?? '#7c3aed');
  const [target, setTarget] = useState(bucket?.target_amount ?? '');
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      await onSave({
        name: name.trim(), icon, color,
        target_amount: target === '' ? null : Number(target),
        target_currency: target === '' ? null : currency,
      });
      onClose();
    } catch { /* parent toasts */ }
    finally { setSaving(false); }
  }

  return (
    <Modal open onClose={onClose} title={isEdit ? 'Edit Bucket' : 'New Bucket'} size="sm">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label">Name</label>
          <input className="input" value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g. Dubai Trip" autoFocus maxLength={40} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Icon</label>
            <div className="flex flex-wrap gap-1">
              {ICON_CHOICES.map(ic => (
                <button key={ic} type="button" onClick={() => setIcon(ic)}
                  className={`w-8 h-8 rounded-lg text-base flex items-center justify-center transition-all ${
                    icon === ic ? 'bg-brand-100 dark:bg-brand-900/40 ring-2 ring-brand-500' : 'hover:bg-gray-100 dark:hover:bg-slate-700'}`}>
                  {ic}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Color</label>
            <div className="flex flex-wrap gap-1.5">
              {COLORS.map(c => (
                <button key={c} type="button" onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full transition-all ${color === c ? 'ring-2 ring-offset-2 ring-gray-400 dark:ring-offset-slate-800' : ''}`}
                  style={{ background: c }} />
              ))}
            </div>
          </div>
        </div>

        <div>
          <label className="label">Target amount <span className="text-gray-400 font-normal">(optional)</span></label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-400 select-none">{currency}</span>
            <input type="number" step="0.01" min="0" className="input pl-11" value={target}
              onChange={e => setTarget(e.target.value)} placeholder="No target" />
          </div>
        </div>

        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button type="submit" disabled={!name.trim() || saving} className="btn-primary flex-1">
            {saving ? 'Saving…' : isEdit ? 'Save' : 'Create'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ── Assign tab: date-filtered transaction list with per-row bucket save ── */
function AssignTab({ buckets, currency }) {
  const api = useApi();
  const [start, setStart] = useState(monthStart());
  const [end, setEnd] = useState(today());
  const [rows, setRows] = useState([]);     // { ...expense, draft: number[], saving, dirty }
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { expenses } = await getExpenses(api, { startDate: start, endDate: end, limit: 500, sortBy: 'id', sortDir: 'DESC' });
      setRows(expenses.map(e => ({ ...e, draft: e.bucket_ids || [], saving: false, dirty: false })));
    } catch { showToast('Failed to load transactions', 'error'); }
    finally { setLoading(false); }
  }, [api, start, end]);

  useEffect(() => { load(); }, [load]);

  function setDraft(id, draft) {
    setRows(rs => rs.map(r => r.id === id ? { ...r, draft, dirty: true } : r));
  }

  async function save(row) {
    setRows(rs => rs.map(r => r.id === row.id ? { ...r, saving: true } : r));
    try {
      await setExpenseBuckets(api, row.id, row.draft);
      setRows(rs => rs.map(r => r.id === row.id ? { ...r, saving: false, dirty: false, bucket_ids: row.draft } : r));
      showToast('Buckets saved');
    } catch {
      setRows(rs => rs.map(r => r.id === row.id ? { ...r, saving: false } : r));
      showToast('Failed to save', 'error');
    }
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="card p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label">From</label>
          <input type="date" className="input !py-1.5" value={start} onChange={e => setStart(e.target.value)} />
        </div>
        <div>
          <label className="label">To</label>
          <input type="date" className="input !py-1.5" value={end} onChange={e => setEnd(e.target.value)} />
        </div>
        <p className="text-xs text-gray-400 dark:text-slate-500 ml-auto">{rows.length} transaction{rows.length !== 1 ? 's' : ''}</p>
      </div>

      {loading ? <Spinner /> : rows.length === 0 ? (
        <div className="card"><EmptyState icon="🧾" title="No transactions" description="No expenses in this date range." /></div>
      ) : (
        <div className="card divide-y divide-gray-100 dark:divide-slate-700/60">
          {rows.map(row => (
            <div key={row.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-800 dark:text-slate-200 truncate">
                  {row.description || row.category_name || 'Expense'}
                </p>
                <p className="text-[11px] text-gray-400 dark:text-slate-500">{row.date} · {fmt(row.amount)} {row.currency || currency}</p>
              </div>
              <BucketPicker buckets={buckets} value={row.draft} onChange={d => setDraft(row.id, d)}
                className="w-44 shrink-0" placeholder="Assign…" />
              <button onClick={() => save(row)} disabled={!row.dirty || row.saving}
                className="btn-primary !px-3 shrink-0 flex items-center gap-1 disabled:opacity-40">
                <Save size={13} />{row.saving ? '…' : 'Save'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Overview tab: KPIs + horizontal-bar breakdown + trend ── */
function OverviewTab({ buckets, currency }) {
  const api = useApi();
  const [start, setStart] = useState(monthStart());
  const [end, setEnd] = useState(today());
  const [breakdown, setBreakdown] = useState([]);
  const [trend, setTrend] = useState([]);
  const [selBucket, setSelBucket] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await getBucketBreakdown(api, { startDate: start, endDate: end });
      setBreakdown(data);
      const sel = data[0]?.id ?? buckets[0]?.id ?? null;
      setSelBucket(sel);
    } catch { showToast('Failed to load bucket stats', 'error'); }
    finally { setLoading(false); }
  }, [api, start, end, buckets]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!selBucket) { setTrend([]); return; }
    getBucketTrend(api, selBucket, { startDate: start, endDate: end })
      .then(({ data }) => setTrend(data)).catch(() => setTrend([]));
  }, [api, selBucket, start, end]);

  const summed = breakdown.reduce((s, b) => s + b.total, 0);
  const topBucket = breakdown[0];

  if (loading) return <Spinner />;

  return (
    <div className="space-y-4 animate-fade-in">
      {/* date range */}
      <div className="card p-4 flex flex-wrap items-end gap-3">
        <div><label className="label">From</label><input type="date" className="input !py-1.5" value={start} onChange={e => setStart(e.target.value)} /></div>
        <div><label className="label">To</label><input type="date" className="input !py-1.5" value={end} onChange={e => setEnd(e.target.value)} /></div>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="card p-4"><p className="text-xs text-gray-400 uppercase tracking-wide">Bucketed spend</p><p className="text-xl font-bold mt-1">{fmt(summed)} <span className="text-xs text-gray-400">{currency}</span></p></div>
        <div className="card p-4"><p className="text-xs text-gray-400 uppercase tracking-wide">Buckets</p><p className="text-xl font-bold mt-1">{buckets.length}</p></div>
        <div className="card p-4"><p className="text-xs text-gray-400 uppercase tracking-wide">Top bucket</p><p className="text-xl font-bold mt-1 truncate">{topBucket ? `${topBucket.icon || ''} ${topBucket.name}` : '—'}</p></div>
      </div>

      {/* breakdown bars */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Spend by bucket</h3>
        </div>
        <p className="text-[11px] text-gray-400 dark:text-slate-500 flex items-center gap-1 mb-4">
          <Info size={11} /> A transaction in several buckets is counted in each, so totals can exceed your actual spend.
        </p>
        {breakdown.length === 0 ? (
          <EmptyState icon="🪣" title="Nothing bucketed yet" description="Assign transactions to buckets to see the breakdown." />
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(160, breakdown.length * 44)}>
            <BarChart data={breakdown} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => fmt(v)} />
              <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
              <Tooltip {...tooltipStyle} formatter={v => [`${fmt(v)} ${currency}`, 'Spent']} cursor={{ fill: 'rgba(124,58,237,0.06)' }} />
              <Bar dataKey="total" radius={[0, 6, 6, 0]} barSize={22}>
                {breakdown.map((b, i) => <Cell key={b.id} fill={b.color || COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* trend line */}
      {breakdown.length > 0 && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4 gap-2">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Trend</h3>
            <select className="input !py-1.5 !text-xs w-auto" value={selBucket ?? ''} onChange={e => setSelBucket(Number(e.target.value))}>
              {breakdown.map(b => <option key={b.id} value={b.id}>{b.icon} {b.name}</option>)}
            </select>
          </div>
          {trend.length === 0 ? (
            <p className="text-xs text-gray-400 py-6 text-center">No spending for this bucket in range.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={d => d.slice(5)} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => fmt(v)} />
                <Tooltip {...tooltipStyle} formatter={v => [`${fmt(v)} ${currency}`, 'Spent']} />
                <Line type="monotone" dataKey="total" stroke="#7c3aed" strokeWidth={2.5} dot={false} activeDot={{ r: 5, fill: '#7c3aed' }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Buckets tab: CRUD list with target progress bars ── */
function ManageTab({ buckets, currency, onCreate, onUpdate, onDelete }) {
  const [showAdd, setShowAdd] = useState(false);
  const [editTarget, setEditTarget] = useState(null);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex justify-end">
        <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-1.5">
          <Plus size={15} /> New Bucket
        </button>
      </div>

      {buckets.length === 0 ? (
        <div className="card"><EmptyState icon="🪣" title="No buckets yet" description="Create a bucket to group transactions across categories." /></div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {buckets.map(b => {
            const hasTarget = b.target_amount != null && Number(b.target_amount) > 0;
            const pct = hasTarget ? Math.min(Math.round((b.spent / b.target_amount) * 100), 100) : 0;
            const over = hasTarget && b.spent > b.target_amount;
            const warn = hasTarget && pct >= 80 && !over;
            const barColor = over ? 'bg-red-500' : warn ? 'bg-amber-400' : 'bg-brand-500';
            return (
              <div key={b.id} className="card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0" style={{ background: `${b.color}22` }}>{b.icon}</span>
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 dark:text-white truncate">{b.name}</p>
                      <p className="text-[11px] text-gray-400 dark:text-slate-500">{b.expense_count} txn · {fmt(b.spent)} {currency} this month</p>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => setEditTarget(b)} className="p-1.5 rounded-lg text-gray-400 hover:text-brand-500 hover:bg-gray-100 dark:hover:bg-slate-700"><Pencil size={13} /></button>
                    <button onClick={() => onDelete(b)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-slate-700"><Trash2 size={13} /></button>
                  </div>
                </div>
                {hasTarget && (
                  <div className="mt-3">
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-gray-500 dark:text-slate-400">{fmt(b.spent)} / {fmt(b.target_amount)} {currency}</span>
                      <span className={over ? 'text-red-500 font-semibold' : warn ? 'text-amber-500 font-semibold' : 'text-gray-400'}>{pct}%</span>
                    </div>
                    <div className="w-full bg-gray-100 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
                      <div className={`h-2 rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showAdd && <BucketFormModal currency={currency} onSave={onCreate} onClose={() => setShowAdd(false)} />}
      {editTarget && <BucketFormModal bucket={editTarget} currency={currency} onSave={d => onUpdate(editTarget.id, d)} onClose={() => setEditTarget(null)} />}
    </div>
  );
}

/* ── Page shell ─────────────────────────────────────────────── */
const TABS = [['overview', 'Overview'], ['manage', 'Buckets'], ['assign', 'Assign']];

export default function Buckets() {
  const api = useApi();
  const { user } = useAuth();
  const currency = user?.currency || 'EGP';
  const [tab, setTab] = useState('overview');
  const [buckets, setBuckets] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchBuckets = useCallback(async () => {
    try {
      const { buckets } = await getBuckets(api);
      setBuckets(buckets);
    } catch { showToast('Failed to load buckets', 'error'); }
    finally { setLoading(false); }
  }, [api]);

  useEffect(() => { fetchBuckets(); }, [fetchBuckets]);

  async function handleCreate(data) {
    try { const { buckets } = await createBucket(api, data); setBuckets(buckets); showToast('Bucket created'); }
    catch (err) { showToast(err.response?.data?.error || 'Failed to create bucket', 'error'); throw err; }
  }
  async function handleUpdate(id, data) {
    try { const { buckets } = await updateBucket(api, id, data); setBuckets(buckets); showToast('Bucket updated'); }
    catch (err) { showToast(err.response?.data?.error || 'Failed to update bucket', 'error'); throw err; }
  }
  async function handleDelete(b) {
    if (!window.confirm(`Delete "${b.name}"? Transactions stay, but lose this bucket.`)) return;
    try { await deleteBucket(api, b.id); setBuckets(bs => bs.filter(x => x.id !== b.id)); showToast('Bucket deleted'); }
    catch { showToast('Failed to delete bucket', 'error'); }
  }

  if (loading) return <Spinner />;

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center gap-2">
        <div className="w-9 h-9 rounded-xl bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center">
          <Boxes size={18} className="text-brand-600 dark:text-brand-400" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">Buckets</h1>
          <p className="text-xs text-gray-400 dark:text-slate-500">Group transactions across categories & track them.</p>
        </div>
      </div>

      <div className="flex gap-0.5 p-0.5 bg-gray-100 dark:bg-slate-700/60 rounded-lg w-fit">
        {TABS.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
              tab === id ? 'bg-white dark:bg-slate-800 text-brand-600 dark:text-brand-400 shadow-sm' : 'text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab buckets={buckets} currency={currency} />}
      {tab === 'manage' && <ManageTab buckets={buckets} currency={currency} onCreate={handleCreate} onUpdate={handleUpdate} onDelete={handleDelete} />}
      {tab === 'assign' && <AssignTab buckets={buckets} currency={currency} />}
    </div>
  );
}
