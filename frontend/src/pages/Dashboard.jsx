import { useState, useEffect, useCallback } from 'react';
import useApi from '../hooks/useApi';
import useAuth from '../hooks/useAuth';
import { showToast } from '../components/common/Toast';
import Spinner from '../components/common/Spinner';
import ExpenseInputPanel from '../components/dashboard/ExpenseInputPanel';
import ParsedExpenseConfirm from '../components/dashboard/ParsedExpenseConfirm';
import { getDashboardStats } from '../api/reportsApi';
import { createExpenses } from '../api/expensesApi';
import { parseExpenses } from '../api/aiApi';
import { getCategories, createCategory, createSubcategory } from '../api/categoriesApi';
import { getSettings } from '../api/settingsApi';
import FinanceChat from '../components/dashboard/FinanceChat';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function SummaryStrip({ stats, currency }) {
  if (!stats) return null;
  const fmt = n => Number(n ?? 0).toLocaleString('en', { maximumFractionDigits: 0 });
  const month = new Date().toLocaleString('en', { month: 'long' });
  const hasData = stats.transactionCount > 0;
  return (
    <div className="px-4 py-3.5 rounded-xl bg-brand-50 dark:bg-brand-900/20 border border-brand-100 dark:border-brand-800/30">
      {hasData ? (
        <p className="text-sm text-gray-600 dark:text-slate-300 leading-relaxed">
          In <span className="font-semibold text-gray-800 dark:text-slate-100">{month}</span> you've spent{' '}
          <span className="font-bold text-brand-600 dark:text-brand-400">{fmt(stats.totalThisMonth)} {currency}</span>{' '}
          across <span className="font-semibold text-gray-800 dark:text-slate-100">{stats.transactionCount} transaction{stats.transactionCount !== 1 ? 's' : ''}</span>.{' '}
          {stats.topCategory && (
            <>Your biggest spending category is <span className="font-semibold text-gray-800 dark:text-slate-100">{stats.topCategory}</span>, </>
          )}
          averaging <span className="font-semibold text-gray-800 dark:text-slate-100">{fmt(stats.dailyAverage)} {currency}</span> per day.
        </p>
      ) : (
        <p className="text-sm text-gray-500 dark:text-slate-400">
          No expenses recorded in <span className="font-semibold text-gray-700 dark:text-slate-300">{month}</span> yet. Start by logging one below.
        </p>
      )}
    </div>
  );
}

export default function Dashboard() {
  const api = useApi();
  const { user } = useAuth();
  const [stats,      setStats]      = useState(null);
  const [categories, setCategories] = useState([]);
  const [currency,   setCurrency]   = useState(user?.currency || 'EGP');
  const [loading,    setLoading]    = useState(true);
  const [parsing,    setParsing]    = useState(false);
  const [parsed,     setParsed]     = useState(null);
  const [saving,     setSaving]     = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [statsRes, catsRes, settingsRes] = await Promise.allSettled([
        getDashboardStats(api),
        getCategories(api),
        getSettings(api),
      ]);
      if (statsRes.status    === 'fulfilled') setStats(statsRes.value);
      if (catsRes.status     === 'fulfilled') setCategories(catsRes.value.categories);
      if (settingsRes.status === 'fulfilled') setCurrency(settingsRes.value.currency || user?.currency || 'EGP');
    } catch { showToast('Failed to load dashboard', 'error'); }
    finally { setLoading(false); }
  }, [api, user]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function handleParse(text) {
    setParsing(true);
    try {
      const data = await parseExpenses(api, text);
      if (!data.expenses?.length) {
        showToast('No expenses found in your message', 'warning');
      } else {
        setParsed(data.expenses);
      }
    } catch (err) {
      showToast(err.response?.data?.error || 'Parsing failed', 'error');
    } finally { setParsing(false); }
  }

  async function handleConfirm(confirmed) {
    try {
      await createExpenses(api, confirmed);
    } catch {
      showToast('Failed to save expenses', 'error');
      throw new Error('save_failed');
    }
    showToast(`${confirmed.length} expense${confirmed.length !== 1 ? 's' : ''} saved!`);
    fetchAll();
    return [];
  }

  async function handleManualAdd(expense) {
    setSaving(true);
    try {
      await createExpenses(api, [expense]);
      showToast('Expense saved!');
      fetchAll();
    } catch { showToast('Failed to save expense', 'error'); }
    finally { setSaving(false); }
  }

  async function handleCreateCategory(name) {
    const data = await createCategory(api, { name, icon: '📌', color: '#6366f1' });
    const fresh = await getCategories(api);
    setCategories(fresh.categories);
    return fresh.categories.find(c => c.name === name) || data;
  }

  async function handleCreateSubcategory(categoryId, name) {
    await createSubcategory(api, categoryId, name);
    const fresh = await getCategories(api);
    setCategories(fresh.categories);
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>
  );

  const name = user?.email?.split('@')[0];

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Greeting */}
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
          {greeting()}, {name} 👋
        </h2>
      </div>

      {/* Summary strip */}
      <SummaryStrip stats={stats} currency={currency} />

      {/* Log Expense */}
      <ExpenseInputPanel
        onParse={handleParse}
        onAdd={handleManualAdd}
        loading={parsing}
        saving={saving}
        categories={categories}
        currency={currency}
        onCreateCategory={handleCreateCategory}
        onCreateSubcategory={handleCreateSubcategory}
      />

      {parsed && (
        <ParsedExpenseConfirm
          expenses={parsed}
          categories={categories}
          onConfirm={handleConfirm}
          onClose={() => setParsed(null)}
        />
      )}

      {/* Ask Claude about your finances */}
      <FinanceChat />
    </div>
  );
}
