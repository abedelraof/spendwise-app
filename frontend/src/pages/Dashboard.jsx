import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import useApi from '../hooks/useApi';
import useAuth from '../hooks/useAuth';
import { showToast } from '../components/common/Toast';
import Spinner from '../components/common/Spinner';
import ExpenseInputPanel from '../components/dashboard/ExpenseInputPanel';
import ParsedExpenseConfirm from '../components/dashboard/ParsedExpenseConfirm';
import BudgetAlerts from '../components/dashboard/BudgetAlerts';
import UpcomingBills from '../components/dashboard/UpcomingBills';
import { getDashboardStats } from '../api/reportsApi';
import { createExpenses } from '../api/expensesApi';
import { parseExpenses } from '../api/aiApi';
import { getCategories, createCategory, createSubcategory } from '../api/categoriesApi';
import { getSettings } from '../api/settingsApi';
import { getBudgets } from '../api/budgetsApi';
import { getGoals } from '../api/goalsApi';
import { getUpcomingRecurring } from '../api/recurringApi';
import FinanceChat from '../components/dashboard/FinanceChat';

function GoalsStrip({ goals }) {
  if (!goals?.length) return null;
  const shown = goals.slice(0, 3);
  const fmt = n => Number(n ?? 0).toLocaleString('en', { maximumFractionDigits: 0 });
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Savings Goals</h3>
        <Link to="/app/planning" className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline">
          View all →
        </Link>
      </div>
      <div className="space-y-3">
        {shown.map(goal => {
          const current = goal.account_id && goal.latest_balance != null ? goal.latest_balance : (goal.current_amount ?? 0);
          const pct = goal.target_amount > 0
            ? Math.min(100, Math.round((current / goal.target_amount) * 100)) : 0;
          return (
            <div key={goal.id}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="flex items-center gap-1.5 font-medium text-gray-700 dark:text-slate-300 truncate">
                  <span>{goal.icon}</span> {goal.name}
                </span>
                <span className="shrink-0 ml-2 font-semibold text-brand-600 dark:text-brand-400">{pct}%</span>
              </div>
              <div className="w-full bg-gray-100 dark:bg-slate-700 rounded-full h-1.5">
                <div className={`h-1.5 rounded-full transition-all duration-500 ${pct >= 100 ? 'bg-emerald-500' : 'bg-brand-500'}`}
                  style={{ width: `${pct}%` }} />
              </div>
              <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-0.5">
                {fmt(current)} / {fmt(goal.target_amount)} {goal.target_currency}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

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
  const [budgets,    setBudgets]    = useState([]);
  const [goals,      setGoals]      = useState([]);
  const [upcomingBills, setUpcomingBills] = useState([]);

  const fetchAll = useCallback(async () => {
    try {
      const [statsRes, catsRes, settingsRes, budgetsRes, goalsRes, billsRes] = await Promise.allSettled([
        getDashboardStats(api),
        getCategories(api),
        getSettings(api),
        getBudgets(api),
        getGoals(api),
        getUpcomingRecurring(api, 7),
      ]);
      if (statsRes.status    === 'fulfilled') setStats(statsRes.value);
      if (catsRes.status     === 'fulfilled') setCategories(catsRes.value.categories);
      if (settingsRes.status === 'fulfilled') setCurrency(settingsRes.value.currency || user?.currency || 'EGP');
      if (budgetsRes.status  === 'fulfilled') setBudgets(budgetsRes.value.budgets || []);
      if (goalsRes.status    === 'fulfilled') setGoals((goalsRes.value.goals || []).filter(g => {
        const current = g.account_id && g.latest_balance != null ? g.latest_balance : (g.current_amount ?? 0);
        return current < g.target_amount;
      }));
      if (billsRes.status    === 'fulfilled') setUpcomingBills(billsRes.value.data || []);
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

      {/* Budget Alerts */}
      <BudgetAlerts budgets={budgets} />

      {/* Upcoming Bills */}
      <UpcomingBills bills={upcomingBills} />

      {/* Goals Progress */}
      <GoalsStrip goals={goals} />

      {/* Ask Claude about your finances */}
      <FinanceChat />
    </div>
  );
}
