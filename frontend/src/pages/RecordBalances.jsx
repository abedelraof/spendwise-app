import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CalendarDays, Save, TrendingUp, TrendingDown, Landmark, CheckCircle2, AlertCircle } from 'lucide-react';
import useApi from '../hooks/useApi';
import useAuth from '../hooks/useAuth';
import Spinner from '../components/common/Spinner';
import { showToast } from '../components/common/Toast';
import { getAccounts, recordBalances, getRates } from '../api/accountsApi';
import { getSettings } from '../api/settingsApi';

const todayISO = () => new Date().toISOString().split('T')[0];

const fmt  = (n) => Number(n ?? 0).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtK = (n) => {
  const v = Math.abs(Number(n ?? 0));
  if (v >= 1_000_000) return (Number(n) / 1_000_000).toFixed(2) + 'M';
  if (v >= 1_000)     return (Number(n) / 1_000).toFixed(1) + 'K';
  return fmt(n);
};

export default function RecordBalances() {
  const api      = useApi();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [rates,    setRates]    = useState(null);
  const [homeCurrency, setHomeCurrency] = useState('EGP');
  const [recordedDate, setRecordedDate] = useState(todayISO());
  const [notes,    setNotes]    = useState('');
  const [values,   setValues]   = useState({});
  const [dirty,    setDirty]    = useState(false);

  const fetchData = useCallback(async () => {
    try {
      let currency = user?.currency || 'EGP';
      try {
        const s = await getSettings(api);
        currency = s.accounts_currency || user?.currency || 'EGP';
      } catch {}
      setHomeCurrency(currency);

      const [accountsRes, ratesRes] = await Promise.allSettled([
        getAccounts(api),
        getRates(api, currency),
      ]);

      if (accountsRes.status === 'fulfilled') {
        const accs = accountsRes.value.accounts;
        setAccounts(accs);
        // Pre-fill with latest known balances
        setValues(Object.fromEntries(accs.map(a => {
          if (a.type === 'commodity') {
            return [a.id, {
              quantity:     a.latest_quantity      != null ? String(a.latest_quantity)      : '',
              pricePerUnit: a.latest_price_per_unit != null ? String(a.latest_price_per_unit) : '',
            }];
          }
          return [a.id, ''];
        })));
      }
      if (ratesRes.status === 'fulfilled') setRates(ratesRes.value);
    } finally {
      setLoading(false);
    }
  }, [api, user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Live conversion helper
  function toHome(amount, currency) {
    if (currency === homeCurrency) return amount;
    const rate = parseFloat(rates?.rates?.[currency]);
    return (!isNaN(rate) && rate > 0) ? amount / rate : amount;
  }

  // Compute live totals from current input values
  function getLiveBalance(a) {
    if (a.type === 'commodity') {
      const qty = parseFloat(values[a.id]?.quantity);
      const ppu = parseFloat(values[a.id]?.pricePerUnit);
      return (!isNaN(qty) && !isNaN(ppu)) ? qty * ppu : null;
    }
    const v = parseFloat(values[a.id]);
    return isNaN(v) ? null : v;
  }

  const assetAccounts     = accounts.filter(a => a.type !== 'liability');
  const liabilityAccounts = accounts.filter(a => a.type === 'liability');

  function sumGroup(list) {
    return list.reduce((sum, a) => {
      const bal = getLiveBalance(a);
      if (bal == null) {
        // fall back to stored latest balance
        const stored = parseFloat(a.latest_balance);
        if (isNaN(stored)) return sum;
        return sum + toHome(stored, a.currency);
      }
      return sum + toHome(bal, a.currency);
    }, 0);
  }

  const liveAssets      = sumGroup(assetAccounts);
  const liveLiabilities = sumGroup(liabilityAccounts);
  const liveNetWorth    = liveAssets - liveLiabilities;

  // Count how many accounts have been filled in this session
  const filledCount = accounts.filter(a => {
    if (a.type === 'commodity') {
      return values[a.id]?.quantity !== '' && values[a.id]?.pricePerUnit !== '';
    }
    return values[a.id] !== '';
  }).length;

  function setMon(id, val) {
    setValues(v => ({ ...v, [id]: val }));
    setDirty(true);
  }
  function setQty(id, val) {
    setValues(v => ({ ...v, [id]: { ...v[id], quantity: val } }));
    setDirty(true);
  }
  function setPpu(id, val) {
    setValues(v => ({ ...v, [id]: { ...v[id], pricePerUnit: val } }));
    setDirty(true);
  }

  async function handleSave() {
    const entries = accounts.flatMap(a => {
      const exchangeRate = (a.currency === homeCurrency || !rates?.rates)
        ? 1.0
        : (parseFloat(rates.rates[a.currency]) || 1.0);
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
      await recordBalances(api, { entries, recordedDate, notes: notes.trim() || undefined });
      setDirty(false);
      showToast('Balances recorded');
      navigate('/app/accounts');
    } catch {
      showToast('Failed to record balances', 'error');
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    if (dirty && !window.confirm('Discard unsaved balances?')) return;
    navigate('/app/accounts');
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>
  );

  const AccountCard = ({ account: a }) => {
    const qty   = values[a.id]?.quantity     ?? '';
    const ppu   = values[a.id]?.pricePerUnit ?? '';
    const monVal = a.type !== 'commodity' ? (values[a.id] ?? '') : '';
    const total = qty && ppu ? parseFloat(qty) * parseFloat(ppu) : null;
    const isFilled = a.type === 'commodity'
      ? (qty !== '' && ppu !== '')
      : monVal !== '';
    const isLiability = a.type === 'liability';

    return (
      <div className={`card p-4 flex flex-col gap-3 transition-all duration-200 ${
        isFilled
          ? isLiability
            ? 'ring-2 ring-red-400/40 dark:ring-red-500/30'
            : 'ring-2 ring-brand-400/40 dark:ring-brand-500/30'
          : ''
      }`}>
        {/* Account identity row */}
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0"
            style={{ backgroundColor: a.color + '28' }}>
            {a.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{a.name}</p>
              {isFilled && (
                <CheckCircle2 size={13} className={isLiability ? 'text-red-400 shrink-0' : 'text-emerald-400 shrink-0'} />
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-md bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400">
                {a.currency}
              </span>
              {a.type === 'commodity' && (
                <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400">
                  {a.unit}
                </span>
              )}
              {isLiability && (
                <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400">
                  Liability
                </span>
              )}
            </div>
          </div>
          {a.latest_balance != null && (
            <div className="text-right shrink-0">
              <p className="text-[10px] text-gray-400 dark:text-slate-500">Last</p>
              <p className="text-xs font-semibold text-gray-500 dark:text-slate-400">
                {fmt(parseFloat(a.latest_balance))}
              </p>
            </div>
          )}
        </div>

        {/* Input(s) */}
        {a.type === 'commodity' ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] text-gray-400 dark:text-slate-500 mb-1 block">Quantity ({a.unit})</label>
                <input type="number" step="any" min="0" placeholder="0"
                  className="input text-right font-semibold"
                  value={qty} onChange={e => setQty(a.id, e.target.value)} />
              </div>
              <div>
                <label className="text-[11px] text-gray-400 dark:text-slate-500 mb-1 block">Price per {a.unit}</label>
                <input type="number" step="any" min="0" placeholder="0.00"
                  className="input text-right font-semibold"
                  value={ppu} onChange={e => setPpu(a.id, e.target.value)} />
              </div>
            </div>
            {total != null && (
              <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-brand-50 dark:bg-brand-900/20">
                <span className="text-xs text-brand-600 dark:text-brand-400">Total value</span>
                <span className="text-sm font-bold text-brand-700 dark:text-brand-300">
                  {fmt(total)} <span className="font-normal text-xs">{a.currency}</span>
                </span>
              </div>
            )}
          </div>
        ) : (
          <div>
            <label className="text-[11px] text-gray-400 dark:text-slate-500 mb-1 block">
              Balance ({a.currency})
            </label>
            <input type="number" step="0.01" placeholder={a.latest_balance != null ? fmt(parseFloat(a.latest_balance)) : '0.00'}
              className="input text-right font-semibold text-base"
              value={monVal} onChange={e => setMon(a.id, e.target.value)} />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="animate-fade-in pb-32">

      {/* ── Page header ── */}
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <button onClick={handleCancel}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors mb-2">
            <ArrowLeft size={15} /> Back to Accounts
          </button>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Record Balances</h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">
            Update all your account balances for a specific date
          </p>
        </div>
        {/* Date picker */}
        <div className="card px-4 py-3 flex items-center gap-3 self-start">
          <CalendarDays size={16} className="text-brand-500 shrink-0" />
          <div>
            <p className="text-[11px] text-gray-400 dark:text-slate-500 mb-0.5">Snapshot Date</p>
            <input type="date" className="text-sm font-semibold text-gray-900 dark:text-white bg-transparent border-none outline-none focus:ring-0 p-0"
              value={recordedDate} onChange={e => setRecordedDate(e.target.value)} />
          </div>
        </div>
      </div>

      {/* ── Live summary strip ── */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          {
            label: 'Total Assets',
            value: liveAssets,
            icon: TrendingUp,
            color: 'text-emerald-500',
            bg: 'bg-emerald-50 dark:bg-emerald-900/20',
            show: assetAccounts.length > 0,
          },
          {
            label: 'Total Liabilities',
            value: liveLiabilities,
            icon: AlertCircle,
            color: 'text-red-500',
            bg: 'bg-red-50 dark:bg-red-900/20',
            show: liabilityAccounts.length > 0,
          },
          {
            label: 'Net Worth',
            value: liveNetWorth,
            icon: Landmark,
            color: liveNetWorth >= 0 ? 'text-brand-600 dark:text-brand-400' : 'text-red-500',
            bg: 'bg-brand-50 dark:bg-brand-900/20',
            show: true,
          },
        ].filter(s => s.show).map(s => (
          <div key={s.label} className={`card p-4 ${s.bg}`}>
            <div className="flex items-center gap-2 mb-1">
              <s.icon size={14} className={s.color} />
              <p className="text-[11px] font-medium text-gray-500 dark:text-slate-400">{s.label}</p>
            </div>
            <p className={`text-lg font-bold ${s.color} tabular-nums`}>
              {fmtK(s.value)}
              <span className="text-xs font-normal text-gray-400 dark:text-slate-500 ml-1">{homeCurrency}</span>
            </p>
          </div>
        ))}
      </div>

      {/* ── Progress indicator ── */}
      {accounts.length > 0 && (
        <div className="flex items-center gap-3 mb-5">
          <div className="flex-1 h-1.5 bg-gray-100 dark:bg-slate-700/60 rounded-full overflow-hidden">
            <div className="h-1.5 bg-brand-500 rounded-full transition-all duration-500"
              style={{ width: `${(filledCount / accounts.length) * 100}%` }} />
          </div>
          <p className="text-xs text-gray-400 dark:text-slate-500 shrink-0">
            {filledCount} / {accounts.length} filled
          </p>
        </div>
      )}

      {/* ── Asset accounts ── */}
      {assetAccounts.length > 0 && (
        <div className="mb-6">
          <h3 className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-3">
            Assets ({assetAccounts.length})
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {assetAccounts.map(a => <AccountCard key={a.id} account={a} />)}
          </div>
        </div>
      )}

      {/* ── Liability accounts ── */}
      {liabilityAccounts.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-red-400 dark:text-red-500 uppercase tracking-wider mb-3">
            Liabilities ({liabilityAccounts.length})
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {liabilityAccounts.map(a => <AccountCard key={a.id} account={a} />)}
          </div>
        </div>
      )}

      {/* ── Sticky footer ── */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-t border-gray-200 dark:border-slate-700/60">
        <div className="max-w-screen-xl mx-auto px-4 md:px-6 py-3 flex items-center gap-3">
          <input
            className="input flex-1 text-sm"
            placeholder="Notes (optional) — e.g. End of month snapshot"
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
          <button onClick={handleCancel} className="btn-secondary shrink-0">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving} className="btn-primary shrink-0 min-w-[130px]">
            {saving ? 'Saving…' : <><Save size={14} /> Save Balances</>}
          </button>
        </div>
      </div>
    </div>
  );
}
