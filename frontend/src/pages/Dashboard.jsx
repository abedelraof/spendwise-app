import { useState, useEffect, useCallback } from 'react';
import useApi from '../hooks/useApi';
import useAuth from '../hooks/useAuth';
import { showToast } from '../components/common/Toast';
import Spinner from '../components/common/Spinner';
import StatsBar from '../components/dashboard/StatsBar';
import BudgetAlerts from '../components/dashboard/BudgetAlerts';
import MonthlyInsight from '../components/dashboard/MonthlyInsight';
import ExpenseInputPanel from '../components/dashboard/ExpenseInputPanel';
import ParsedExpenseConfirm from '../components/dashboard/ParsedExpenseConfirm';
import LatestTransactions from '../components/dashboard/LatestTransactions';
import { getDashboardStats } from '../api/reportsApi';
import { getExpenses, createExpenses, deleteExpense } from '../api/expensesApi';
import { parseExpenses } from '../api/aiApi';
import { getBudgets } from '../api/budgetsApi';
import { getCategories, createCategory, createSubcategory } from '../api/categoriesApi';
import { getAccounts, getRates } from '../api/accountsApi';
import { getSettings } from '../api/settingsApi';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function Dashboard() {
  const api = useApi();
  const { user } = useAuth();
  const [stats, setStats]     = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [budgets, setBudgets]   = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [netWorthData, setNetWorthData] = useState(null);
  const [parsing, setParsing]   = useState(false);
  const [parsed, setParsed]     = useState(null);
  const [saving, setSaving]     = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [s, e, b, c, settings, accountsData] = await Promise.all([
        getDashboardStats(api),
        getExpenses(api, { limit: 10, sortBy: 'created_at', sortDir: 'DESC' }),
        getBudgets(api),
        getCategories(api),
        getSettings(api).catch(() => null),
        getAccounts(api).catch(() => null),
      ]);
      setStats(s);
      setExpenses(e.expenses);
      setBudgets(b.budgets);
      setCategories(c.categories);

      const homeCurrency = settings?.currency || user?.currency || 'EGP';
      if (accountsData?.accounts) {
        try {
          const ratesData = await getRates(api, homeCurrency);
          const rates = ratesData?.rates;
          const accounts = accountsData.accounts;

          function convertedSum(list) {
            if (!rates) return null;
            return list.reduce((sum, a) => {
              if (a.latest_balance == null) return sum;
              if (a.currency === homeCurrency) return sum + a.latest_balance;
              const rate = rates[a.currency];
              return rate ? sum + a.latest_balance / rate : sum;
            }, 0);
          }

          const assetAccounts     = accounts.filter(a => a.type !== 'liability');
          const liabilityAccounts = accounts.filter(a => a.type === 'liability');
          const totalAssets      = convertedSum(assetAccounts.filter(a => a.latest_balance != null));
          const totalLiabilities = convertedSum(liabilityAccounts.filter(a => a.latest_balance != null));
          const netWorth = totalAssets != null && totalLiabilities != null
            ? totalAssets - totalLiabilities : totalAssets;
          setNetWorthData({ totalAssets, totalLiabilities, netWorth, currency: homeCurrency });
        } catch { /* rates optional */ }
      }
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
    // Return fresh budget data for affected categories so the confirm modal can show impact
    try {
      const { budgets: fresh } = await getBudgets(api);
      const affectedCats = new Set(confirmed.map(e => (e.category || '').toLowerCase()));
      return fresh.filter(b => affectedCats.has((b.category_name || '').toLowerCase()));
    } catch { return []; }
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

  async function handleDelete(id) {
    try {
      await deleteExpense(api, id);
      setExpenses(prev => prev.filter(e => e.id !== id));
      fetchAll();
    } catch { showToast('Failed to delete', 'error'); }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>
  );

  const name = user?.email?.split('@')[0];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Greeting */}
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
          {greeting()}, {name} 👋
        </h2>
      </div>

      <ExpenseInputPanel
        onParse={handleParse}
        onAdd={handleManualAdd}
        loading={parsing}
        saving={saving}
        categories={categories}
        currency={user?.currency}
        onCreateCategory={handleCreateCategory}
        onCreateSubcategory={handleCreateSubcategory}
      />
      <StatsBar stats={stats} currency={user?.currency} netWorthData={netWorthData} />
      <BudgetAlerts budgets={budgets} />
      <MonthlyInsight />
      <LatestTransactions expenses={expenses} onDelete={handleDelete} />

      {parsed && (
        <ParsedExpenseConfirm
          expenses={parsed}
          categories={categories}
          onConfirm={handleConfirm}
          onClose={() => setParsed(null)}
        />
      )}
    </div>
  );
}
