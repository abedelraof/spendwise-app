import { useState, useEffect } from 'react';
import { Bot, Globe, FolderOpen, Upload, CheckCircle, Trash2, ShieldAlert, Palette } from 'lucide-react';
import useApi from '../hooks/useApi';
import useAuth from '../hooks/useAuth';
import { getSettings, updateSettings } from '../api/settingsApi';
import { getCategories } from '../api/categoriesApi';
import { showToast } from '../components/common/Toast';
import Spinner from '../components/common/Spinner';
import Modal from '../components/common/Modal';
import CategoriesManager from '../components/settings/CategoriesManager';
import CsvImport from '../components/settings/CsvImport';

const CURRENCIES = ['EGP','USD','EUR','GBP','ILS','SAR','AED','JPY','CAD','AUD','CHF','INR'];

function SectionCard({ icon: Icon, title, children }) {
  return (
    <div className="card p-6 space-y-5">
      <div className="flex items-center gap-2.5 pb-4 border-b border-gray-100 dark:border-slate-700/60">
        <div className="w-7 h-7 bg-brand-50 dark:bg-brand-900/30 rounded-lg flex items-center justify-center">
          <Icon size={14} className="text-brand-600 dark:text-brand-400" />
        </div>
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h2>
      </div>
      {children}
    </div>
  );
}

// ── Clear Data PIN Modal ──────────────────────────────────────────────────────
function ClearDataModal({ hasPin, api, onClose }) {
  const [pin, setPin]         = useState('');
  const [confirm, setConfirm] = useState('');
  const [clearing, setClearing] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!hasPin && pin !== confirm) {
      showToast('PINs do not match', 'error'); return;
    }
    if (pin.length < 4) {
      showToast('PIN must be at least 4 digits', 'error'); return;
    }
    setClearing(true);
    try {
      await api.post('/settings/clear-data', { pin });
      showToast('All data cleared successfully');
      onClose(true); // true = data was cleared
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to clear data';
      showToast(msg, 'error');
    } finally { setClearing(false); }
  }

  return (
    <Modal open onClose={() => onClose(false)} title="Clear All Data" size="sm">
      <div className="space-y-4">
        <div className="flex items-start gap-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800/40">
          <ShieldAlert size={16} className="text-red-500 mt-0.5 shrink-0" />
          <p className="text-xs text-red-700 dark:text-red-300 leading-relaxed">
            {hasPin
              ? 'This will permanently delete all your expenses, income, accounts, budgets, and recurring items. Enter your PIN to confirm.'
              : 'This will permanently delete all your financial data. Set a PIN — you\'ll need it every time you clear data.'}
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="label">{hasPin ? 'Enter PIN' : 'Set a PIN'}</label>
            <input
              type="password"
              inputMode="numeric"
              className="input"
              placeholder="Min. 4 digits"
              value={pin}
              onChange={e => setPin(e.target.value)}
              autoFocus
              required
            />
          </div>
          {!hasPin && (
            <div>
              <label className="label">Confirm PIN</label>
              <input
                type="password"
                inputMode="numeric"
                className="input"
                placeholder="Repeat PIN"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
              />
            </div>
          )}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={() => onClose(false)} className="btn-secondary flex-1">Cancel</button>
            <button
              type="submit"
              disabled={clearing || !pin || (!hasPin && !confirm)}
              className="flex-1 inline-flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white px-3 py-1.5 rounded-lg font-medium text-sm transition-all duration-150 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {clearing ? <><Spinner size="sm" /> Clearing…</> : <><Trash2 size={13} /> Clear All Data</>}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}

export default function Settings() {
  const api = useApi();
  const { user, updateUser } = useAuth();
  const [settings, setSettings] = useState({ currency: 'EGP', accounts_currency: null, hasApiKey: false, hasPin: false, theme: 'light' });
  const [apiKey, setApiKey]       = useState('');
  const [categories, setCategories] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(null);
  const [showClearModal, setShowClearModal] = useState(false);
  const [panelStyle, setPanelStyle] = useState(() => parseInt(localStorage.getItem('eb_panel_style') || '1'));

  function choosePanelStyle(n) {
    setPanelStyle(n);
    localStorage.setItem('eb_panel_style', String(n));
    window.dispatchEvent(new Event('eb_panel_style_change'));
  }

  async function fetchAll() {
    try {
      const [s, c] = await Promise.all([getSettings(api), getCategories(api)]);
      setSettings(s);
      setCategories(c.categories);
    } catch { showToast('Failed to load settings', 'error'); }
    setLoading(false);
  }

  useEffect(() => { fetchAll(); }, []);

  async function savePreferences() {
    setSaving('prefs');
    try {
      const result = await updateSettings(api, {
        currency:          settings.currency,
        theme:             settings.theme,
        accounts_currency: settings.accounts_currency || null,
      });
      setSettings(prev => ({ ...prev, ...result }));
      updateUser({ currency: result.currency, theme: result.theme });
      showToast('Preferences saved');
    } catch { showToast('Failed to save', 'error'); }
    setSaving(null);
  }

  async function saveApiKey() {
    if (!apiKey.trim()) return;
    setSaving('key');
    try {
      const result = await updateSettings(api, { claudeApiKey: apiKey });
      setSettings(prev => ({ ...prev, ...result }));
      setApiKey('');
      showToast('API key saved');
    } catch { showToast('Failed to save key', 'error'); }
    setSaving(null);
  }

  function handleClearClose(wasCleared) {
    setShowClearModal(false);
    if (wasCleared) fetchAll();
  }

  if (loading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>;

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Preferences */}
        <SectionCard icon={Globe} title="Preferences">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Currency</label>
              <select className="input" value={settings.currency} onChange={e => setSettings(p => ({ ...p, currency: e.target.value }))}>
                {CURRENCIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Accounts Total Currency</label>
              <select
                className="input"
                value={settings.accounts_currency ?? settings.currency}
                onChange={e => setSettings(p => ({ ...p, accounts_currency: e.target.value || null }))}
              >
                <option value="">— Same as home currency —</option>
                {CURRENCIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Theme</label>
              <select className="input" value={settings.theme} onChange={e => setSettings(p => ({ ...p, theme: e.target.value }))}>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
                <option value="system">System (follows OS)</option>
                <option value="high-contrast">High Contrast</option>
              </select>
            </div>
          </div>
          <div className="pt-1">
            <label className="label flex items-center gap-1.5"><Palette size={13} /> Log Expense Style</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-1">
              {[
                { id: 1, label: 'Aurora',   tagline: 'Purple · vibrant',   bar: 'bg-gradient-to-r from-violet-500 to-purple-500' },
                { id: 2, label: 'Slate',    tagline: 'Dark · atmospheric', bar: 'bg-gradient-to-r from-slate-700 to-cyan-600'   },
                { id: 3, label: 'Sunrise',  tagline: 'Warm · friendly',    bar: 'bg-gradient-to-r from-amber-400 to-rose-500'   },
                { id: 4, label: 'Terminal', tagline: 'Dark · developer',   bar: 'bg-gradient-to-r from-gray-900 to-emerald-800' },
              ].map(s => (
                <button key={s.id} onClick={() => choosePanelStyle(s.id)}
                  className={`rounded-xl overflow-hidden border-2 transition-all text-left ${
                    panelStyle === s.id
                      ? 'border-brand-500 ring-2 ring-brand-500/20'
                      : 'border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600'
                  }`}>
                  <div className={`h-2 w-full ${s.bar}`} />
                  <div className="px-2.5 py-2">
                    <p className={`text-xs font-semibold leading-tight ${panelStyle === s.id ? 'text-brand-600 dark:text-brand-400' : 'text-gray-700 dark:text-slate-300'}`}>{s.label}</p>
                    <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-0.5">{s.tagline}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
          <button onClick={savePreferences} disabled={saving === 'prefs'} className="btn-primary">
            {saving === 'prefs' ? <><Spinner size="sm" /> Saving…</> : 'Save preferences'}
          </button>
        </SectionCard>

        {/* Claude AI */}
        <SectionCard icon={Bot} title="Claude AI Integration">
          {settings.hasApiKey && (
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-sm bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 rounded-xl">
              <CheckCircle size={14} /> API key is saved and active
            </div>
          )}
          <div>
            <label className="label">{settings.hasApiKey ? 'Replace API key' : 'Claude API key'}</label>
            <input type="password" className="input" placeholder="sk-ant-..." value={apiKey}
              onChange={e => setApiKey(e.target.value)} />
            <p className="text-xs text-gray-400 dark:text-slate-500 mt-1.5">
              Your key is AES-256 encrypted and never returned by the API.
            </p>
          </div>
          <button onClick={saveApiKey} disabled={saving === 'key' || !apiKey} className="btn-primary">
            {saving === 'key' ? <><Spinner size="sm" /> Saving…</> : 'Save API key'}
          </button>
        </SectionCard>
      </div>

      {/* Categories */}
      <SectionCard icon={FolderOpen} title="Categories">
        <CategoriesManager categories={categories} api={api} onRefresh={fetchAll} />
      </SectionCard>

      {/* CSV Import */}
      <SectionCard icon={Upload} title="Import Data">
        <CsvImport api={api} />
      </SectionCard>

      {/* Danger Zone */}
      <div className="card p-6 border-red-200 dark:border-red-900/50">
        <div className="flex items-center gap-2.5 pb-4 border-b border-red-100 dark:border-red-900/40 mb-5">
          <div className="w-7 h-7 bg-red-50 dark:bg-red-900/30 rounded-lg flex items-center justify-center">
            <ShieldAlert size={14} className="text-red-500" />
          </div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Danger Zone</h2>
        </div>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">Clear all data</p>
            <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
              Permanently delete all expenses, income, accounts, budgets and recurring items.
              {settings.hasPin ? ' PIN required.' : ' You\'ll set a PIN on first use.'}
            </p>
          </div>
          <button onClick={() => setShowClearModal(true)} className="btn-danger shrink-0">
            <Trash2 size={13} /> Clear Data
          </button>
        </div>
      </div>

      {showClearModal && (
        <ClearDataModal hasPin={settings.hasPin} api={api} onClose={handleClearClose} />
      )}
    </div>
  );
}
