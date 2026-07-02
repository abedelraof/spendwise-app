import { useState, useEffect } from 'react';
import { Globe, FolderOpen, Upload, Trash2, ShieldAlert, Sparkles, Send } from 'lucide-react';
import useApi from '../hooks/useApi';
import useAuth from '../hooks/useAuth';
import { getSettings, updateSettings } from '../api/settingsApi';
import { seedDemoData } from '../api/seedApi';
import { getCategories } from '../api/categoriesApi';
import { showToast } from '../components/common/Toast';
import Spinner from '../components/common/Spinner';
import Modal from '../components/common/Modal';
import CategoriesManager from '../components/settings/CategoriesManager';
import CsvImport from '../components/settings/CsvImport';
import TelegramConnect from '../components/settings/TelegramConnect';

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
  const [settings, setSettings] = useState({ currency: 'EGP', accounts_currency: null, hasPin: false, theme: 'light' });
  const [categories, setCategories] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(null);
  const [showClearModal, setShowClearModal] = useState(false);
  const [showSeedModal, setShowSeedModal]   = useState(false);
  const [seeding, setSeeding]               = useState(false);
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

  function handleClearClose(wasCleared) {
    setShowClearModal(false);
    if (wasCleared) fetchAll();
  }

  async function handleSeed() {
    setSeeding(true);
    try {
      const result = await seedDemoData(api);
      if (result.alreadySeeded) {
        showToast('You already have data. Clear it first from the Danger Zone.', 'warning');
      } else {
        showToast('Demo data added! Explore your app 🎉');
        setTimeout(() => window.location.reload(), 800);
      }
    } catch { showToast('Failed to seed data', 'error'); }
    setSeeding(false);
    setShowSeedModal(false);
  }

  if (loading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>;

  return (
    <div className="space-y-5 animate-fade-in">
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
        <button onClick={savePreferences} disabled={saving === 'prefs'} className="btn-primary">
          {saving === 'prefs' ? <><Spinner size="sm" /> Saving…</> : 'Save preferences'}
        </button>
      </SectionCard>

      {/* Telegram */}
      <SectionCard icon={Send} title="Telegram">
        <TelegramConnect api={api} />
      </SectionCard>

      {/* Categories */}
      <SectionCard icon={FolderOpen} title="Categories">
        <CategoriesManager categories={categories} api={api} onRefresh={fetchAll} />
      </SectionCard>

      {/* CSV Import */}
      <SectionCard icon={Upload} title="Import Data">
        <CsvImport api={api} />
      </SectionCard>

      {/* Demo Data */}
      <SectionCard icon={Sparkles} title="Demo Data">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">Fill with sample data</p>
            <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
              Populate your account with realistic expenses, income, accounts, budgets, and goals to explore all features.
            </p>
          </div>
          <button onClick={() => setShowSeedModal(true)} className="btn-primary shrink-0">
            <Sparkles size={13} /> Fill Demo Data
          </button>
        </div>
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

      {showSeedModal && (
        <Modal open onClose={() => setShowSeedModal(false)} title="Fill Demo Data" size="sm">
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3 bg-brand-50 dark:bg-brand-900/20 rounded-xl border border-brand-200 dark:border-brand-800/40">
              <Sparkles size={16} className="text-brand-500 mt-0.5 shrink-0" />
              <p className="text-xs text-brand-700 dark:text-brand-300 leading-relaxed">
                This will add ~60 expenses, 7 income entries, 4 accounts, 5 budgets, 3 recurring items, and 2 savings goals spread across the last 3 months.
              </p>
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setShowSeedModal(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={handleSeed} disabled={seeding} className="btn-primary flex-1">
                {seeding ? <><Spinner size="sm" /> Seeding…</> : <><Sparkles size={13} /> Fill Demo Data</>}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
