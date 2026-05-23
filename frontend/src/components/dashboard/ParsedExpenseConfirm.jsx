import { useState } from 'react';
import { CheckCircle2, ChevronRight, Trash2, CheckCheck } from 'lucide-react';
import Modal from '../common/Modal';
import TagInput from '../common/TagInput';

const CATEGORIES = ['Food','Transport','Housing','Entertainment','Health','Shopping','Education','Utilities','Other'];

const CURRENCIES = [
  'AED','AUD','BRL','CAD','CHF','CNY','CZK','DKK','EGP','EUR',
  'GBP','HKD','HUF','IDR','ILS','INR','JPY','KRW','KWD','MAD',
  'MXN','MYR','NOK','NZD','PHP','PKR','PLN','QAR','RON','RUB',
  'SAR','SEK','SGD','THB','TRY','TWD','UAH','USD','ZAR',
];

const CONFETTI_COLORS = ['#7c3aed','#f97316','#3b82f6','#10b981','#f59e0b','#ec4899','#6366f1','#14b8a6'];
const CONFETTI = Array.from({ length: 28 }, (_, i) => ({
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  left: (i * 3.7 + 1.5) % 100,
  delay: (i * 70) % 500,
  duration: 900 + (i * 61) % 700,
  size: 6 + (i % 4) * 2,
  round: i % 3 === 0,
}));

function fmt(n) { return Number(n || 0).toLocaleString('en', { maximumFractionDigits: 0 }); }

export default function ParsedExpenseConfirm({ expenses: initial, categories = [], onConfirm, onClose }) {
  const [expenses, setExpenses]     = useState(initial.map(e => ({ ...e, notes: e.notes || '', tags: e.tags || '' })));
  const [current, setCurrent]       = useState(0);
  const [isSaving, setIsSaving]     = useState(false);
  const [savedBudgets, setSavedBudgets] = useState(null); // null = not yet saved

  const total = expenses.length;
  const done  = current >= total;

  const update = (field, value) =>
    setExpenses(prev => prev.map((e, i) => i === current ? { ...e, [field]: value } : e));

  const remove = () => {
    const next = expenses.filter((_, i) => i !== current);
    setExpenses(next);
    if (current >= next.length && current > 0) setCurrent(next.length - 1);
  };

  const advance = () => setCurrent(c => c + 1);

  const catOptions = categories.length ? categories.map(c => c.name) : CATEGORIES;
  const subcatMap  = Object.fromEntries(categories.map(c => [c.name, c.subcategories || []]));

  const e        = expenses[current];
  const subcats  = e ? (subcatMap[e.category] || []) : [];
  const progress = total === 0 ? 100 : Math.round((current / total) * 100);

  // Detect AI-suggested new category / subcategory
  const isNewCategory    = e ? (!!e.category    && !catOptions.some(c => c.toLowerCase() === e.category.toLowerCase())) : false;
  const isNewSubcategory = e ? (!!e.subcategory && subcats.length > 0 && !subcats.some(s => s.name?.toLowerCase() === e.subcategory.toLowerCase())) : false;

  // Effective options — put AI-suggested new value at top so it stays selected
  const effectiveCatOptions = isNewCategory
    ? [e.category, ...catOptions]
    : catOptions;
  const effectiveSubcats = isNewSubcategory && subcats.length > 0
    ? [{ id: '__new__', name: e.subcategory }, ...subcats]
    : subcats;

  async function handleSave() {
    setIsSaving(true);
    try {
      const budgets = await onConfirm(expenses);
      setSavedBudgets(budgets ?? []);
    } catch { /* parent shows toast */ }
    finally { setIsSaving(false); }
  }

  // ── Congrats screen ──────────────────────────────────────────────
  if (savedBudgets !== null) {
    const confettiBackdrop = (
      <>
        {CONFETTI.map((c, i) => (
          <div
            key={i}
            className="confetti-piece absolute top-0 pointer-events-none"
            style={{
              left: `${c.left}%`,
              backgroundColor: c.color,
              width: c.size,
              height: c.round ? c.size : c.size * 0.5,
              borderRadius: c.round ? '50%' : 2,
              animationDelay: `${c.delay}ms`,
              animationDuration: `${c.duration}ms`,
            }}
          />
        ))}
      </>
    );

    return (
      <Modal open onClose={onClose} title="" size="md" hideHeader backdrop={confettiBackdrop}>
        {/* Check icon */}
        <div className="flex flex-col items-center pt-4 pb-2 gap-3 text-center">
          <div className="pop-in w-16 h-16 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg">
            <CheckCheck size={32} className="text-white" strokeWidth={2.5} />
          </div>
          <div>
            <p className="text-lg font-bold text-gray-900 dark:text-white">All saved!</p>
            <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">
              {expenses.length} expense{expenses.length !== 1 ? 's' : ''} added successfully
            </p>
          </div>
        </div>

        {/* Budget impact */}
        {savedBudgets.length > 0 && (
          <div className="space-y-3 mb-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500">
              Budget Impact
            </p>
            {savedBudgets.map(b => {
              const remaining = b.amount - b.spent;
              const pct       = Math.min(Math.round((b.spent / b.amount) * 100), 100);
              const isOver    = b.spent > b.amount;
              const isWarn    = pct >= 80 && !isOver;
              const barColor  = isOver ? 'bg-red-500' : isWarn ? 'bg-amber-400' : 'bg-emerald-500';
              const textColor = isOver ? 'text-red-500' : isWarn ? 'text-amber-500' : 'text-emerald-600 dark:text-emerald-400';
              return (
                <div key={b.id}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <div className="flex items-center gap-1.5">
                      {b.icon && <span>{b.icon}</span>}
                      <span className="font-medium text-gray-700 dark:text-slate-300">{b.category_name}</span>
                    </div>
                    <span className={`font-semibold ${textColor}`}>
                      {isOver
                        ? `${fmt(Math.abs(remaining))} over budget`
                        : `${fmt(remaining)} remaining`}
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
                    <div className={`h-1.5 rounded-full transition-all duration-700 ${barColor}`}
                      style={{ width: `${pct}%` }} />
                  </div>
                  <div className="flex justify-between text-[10px] text-gray-400 dark:text-slate-500 mt-0.5">
                    <span>{fmt(b.spent)} spent</span>
                    <span>{fmt(b.amount)} budget</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <button onClick={onClose} className="btn-primary w-full">Done</button>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} title="" size="md" hideHeader>
      {/* Step indicator */}
      <div className="-mx-5 -mt-5 mb-5 px-5 pt-4 pb-3 border-b border-gray-100 dark:border-slate-700/60">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-xs font-semibold text-gray-700 dark:text-slate-300">
            {done ? 'Review & save' : `Step ${current + 1} of ${total}`}
          </span>
          <span className="text-[11px] text-gray-400 dark:text-slate-500">
            {done ? 'All reviewed' : `${total - current - 1} remaining`}
          </span>
        </div>
        <div className="flex gap-1.5">
          {expenses.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                i < current
                  ? 'bg-brand-500'
                  : i === current
                  ? 'bg-brand-400'
                  : 'bg-gray-200 dark:bg-slate-700'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Done / review screen */}
      {done ? (
        <div className="flex flex-col items-center py-4 gap-4 text-center">
          <div className="w-14 h-14 rounded-full bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center">
            <CheckCircle2 size={28} className="text-emerald-500" />
          </div>
          <div>
            <p className="text-base font-bold text-gray-900 dark:text-white">Ready to save</p>
            <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
              {expenses.length === 0
                ? 'All expenses were removed.'
                : `${expenses.length} expense${expenses.length !== 1 ? 's' : ''} will be added.`}
            </p>
          </div>
          {expenses.length > 0 && (
            <div className="w-full space-y-1.5 max-h-36 overflow-y-auto">
              {expenses.map((ex, i) => {
                const catIsNew = !!ex.category && !catOptions.some(c => c.toLowerCase() === ex.category.toLowerCase());
                return (
                  <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 dark:bg-slate-700/50 text-xs">
                    <span className="text-gray-600 dark:text-slate-300 truncate mr-2">{ex.description || ex.category}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {catIsNew && (
                        <span className="text-[10px] text-amber-500 bg-amber-50 dark:bg-amber-900/20 px-1.5 py-0.5 rounded-full font-medium">✨ {ex.category}</span>
                      )}
                      <span className="font-semibold text-gray-900 dark:text-white">{ex.amount} {ex.currency}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex gap-3 w-full pt-1">
            <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button
              disabled={expenses.length === 0 || isSaving}
              onClick={handleSave}
              className="btn-primary flex-1"
            >
              {isSaving ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  Saving…
                </span>
              ) : (
                <><CheckCircle2 size={14} /> Save {expenses.length} Expense{expenses.length !== 1 ? 's' : ''}</>
              )}
            </button>
          </div>
        </div>
      ) : (
        /* Single expense form */
        <div className="space-y-4">
          {e.raw_text && (
            <p className="text-[11px] text-gray-400 dark:text-slate-500 bg-gray-50 dark:bg-slate-700/50 rounded-lg px-3 py-1.5 truncate">
              "{e.raw_text}"
            </p>
          )}

          {/* Amount + Currency */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Amount</label>
              <input type="number" className="input h-9 text-lg font-bold" step="0.01"
                value={e.amount} onChange={ev => update('amount', parseFloat(ev.target.value))} />
            </div>
            <div>
              <label className="label">Currency</label>
              <select className="input h-9" value={e.currency} onChange={ev => update('currency', ev.target.value)}>
                {CURRENCIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* Date */}
          <div>
            <label className="label">Date</label>
            <input type="date" className="input h-9" value={e.date}
              onChange={ev => update('date', ev.target.value)} />
          </div>

          {/* Category */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="label !mb-0">Category</label>
              {isNewCategory && (
                <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded-full">
                  ✨ New category
                </span>
              )}
            </div>
            <select
              className={`input h-9 ${isNewCategory ? 'border-amber-400 dark:border-amber-500 focus:ring-amber-400/30' : ''}`}
              value={e.category}
              onChange={ev => { update('category', ev.target.value); update('subcategory', ''); }}
            >
              {effectiveCatOptions.map(c => <option key={c}>{c}</option>)}
            </select>
            {isNewCategory && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1 leading-snug">
                <strong>"{e.category}"</strong> will be created as a new category — or select an existing one above.
              </p>
            )}
          </div>

          {/* Subcategory */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="label !mb-0">Subcategory</label>
              {isNewSubcategory && (
                <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded-full">
                  ✨ New subcategory
                </span>
              )}
            </div>
            {effectiveSubcats.length ? (
              <select
                className={`input h-9 ${isNewSubcategory ? 'border-amber-400 dark:border-amber-500 focus:ring-amber-400/30' : ''}`}
                value={e.subcategory || ''}
                onChange={ev => update('subcategory', ev.target.value)}
              >
                <option value="">— none —</option>
                {effectiveSubcats.map(s => <option key={s.id || s.name} value={s.name}>{s.name}</option>)}
              </select>
            ) : (
              <input type="text" className="input h-9" value={e.subcategory || ''}
                onChange={ev => update('subcategory', ev.target.value)} placeholder="Optional" />
            )}
            {isNewSubcategory && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1 leading-snug">
                <strong>"{e.subcategory}"</strong> will be created under <strong>{e.category}</strong> — or select an existing one above.
              </p>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="label">Description</label>
            <input type="text" className="input h-9" value={e.description || ''}
              onChange={ev => update('description', ev.target.value)} maxLength={60} />
          </div>

          {/* Notes + Tags */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Notes</label>
              <input type="text" className="input h-9" value={e.notes || ''}
                onChange={ev => update('notes', ev.target.value)} />
            </div>
            <div>
              <label className="label">Tags</label>
              <TagInput value={e.tags || ''} onChange={v => update('tags', v)} />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            <button onClick={remove}
              className="flex items-center gap-1 text-xs text-red-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 px-2.5 py-1.5 rounded-lg transition-colors">
              <Trash2 size={12} /> Remove
            </button>
            <button onClick={onClose} className="btn-secondary ml-auto">Cancel</button>
            <button onClick={advance} className="btn-primary">
              {current === total - 1 ? (
                <><CheckCircle2 size={14} /> Review</>
              ) : (
                <>Next <ChevronRight size={14} /></>
              )}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
