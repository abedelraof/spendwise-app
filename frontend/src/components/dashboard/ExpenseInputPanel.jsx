import { useState } from 'react';
import { Sparkles, Loader2, PenLine, Send, Plus, Check, X } from 'lucide-react';

const PLACEHOLDER = `What did you spend? e.g. "coffee 45, taxi 80" or "lunch 120 EGP"`;

const DEFAULT_CATS = [
  { name: 'Food' }, { name: 'Transport' }, { name: 'Shopping' },
  { name: 'Health' }, { name: 'Entertainment' }, { name: 'Other' },
];

function today() { return new Date().toISOString().split('T')[0]; }

/* ── Tiny inline "type + confirm" input ──────────────────────────── */
function InlineAdd({ placeholder, onConfirm, onCancel }) {
  const [val, setVal] = useState('');
  function confirm() { if (val.trim()) onConfirm(val.trim()); }
  return (
    <div className="flex items-center gap-1 w-full">
      <input
        autoFocus type="text"
        className="input flex-1 min-w-0"
        placeholder={placeholder}
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); confirm(); }
          if (e.key === 'Escape') onCancel();
        }}
      />
      <button type="button" onClick={confirm} disabled={!val.trim()}
        className="shrink-0 w-8 flex items-center justify-center rounded-lg bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-40 transition-colors self-stretch">
        <Check size={13} />
      </button>
      <button type="button" onClick={onCancel}
        className="shrink-0 w-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors self-stretch">
        <X size={13} />
      </button>
    </div>
  );
}

export default function ExpenseInputPanel({
  onParse, onAdd, loading, saving,
  categories, currency,
  onCreateCategory, onCreateSubcategory,
}) {
  const [tab, setTab] = useState('ai');

  /* ── AI state ─────────────────────── */
  const [text, setText] = useState('');

  /* ── Manual state ─────────────────── */
  const catList = categories.length ? categories : DEFAULT_CATS;
  const [amount,      setAmount]      = useState('');
  const [date,        setDate]        = useState(today());
  const [category,    setCategory]    = useState(catList[0]?.name || 'Food');
  const [subcategory, setSubcategory] = useState('');
  const [description, setDescription] = useState('');

  /* ── Inline-add state ─────────────── */
  const [addingCat,    setAddingCat]    = useState(false);
  const [addingSubcat, setAddingSubcat] = useState(false);
  const [catSaving,    setCatSaving]    = useState(false);

  const currentCat = catList.find(c => c.name === category);
  const subcats    = currentCat?.subcategories || [];

  function handleAiSubmit(e) {
    e.preventDefault();
    if (!text.trim() || loading) return;
    onParse(text);
    setText('');
  }

  async function handleManualSubmit(e) {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) return;
    await onAdd({
      amount:        parseFloat(amount),
      currency,
      exchange_rate: 1,
      date,
      category,
      subcategory:   subcategory || null,
      description:   description.trim() || null,
    });
    setAmount('');
    setDescription('');
    setSubcategory('');
    setDate(today());
  }

  async function handleNewCategory(name) {
    if (!onCreateCategory) return;
    setCatSaving(true);
    try {
      await onCreateCategory(name);
      setCategory(name);
      setAddingCat(false);
    } finally { setCatSaving(false); }
  }

  async function handleNewSubcategory(name) {
    if (!onCreateSubcategory || !currentCat?.id) return;
    await onCreateSubcategory(currentCat.id, name);
    setSubcategory(name);
    setAddingSubcat(false);
  }

  return (
    <div className="card p-5 space-y-4">

      {/* Header ───────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Log Expense</h3>
        <div className="flex gap-0.5 p-0.5 bg-gray-100 dark:bg-slate-700/60 rounded-lg">
          {[['ai', Sparkles, 'AI'], ['manual', PenLine, 'Manual']].map(([id, Icon, label]) => (
            <button key={id} type="button" onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all ${
                tab === id
                  ? 'bg-white dark:bg-slate-800 text-brand-600 dark:text-brand-400 shadow-sm'
                  : 'text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300'
              }`}>
              <Icon size={11} />{label}
            </button>
          ))}
        </div>
      </div>

      {/* AI tab ───────────────────────────────────── */}
      {tab === 'ai' && (
        <form onSubmit={handleAiSubmit} className="space-y-3">
          <textarea
            className="input w-full resize-none leading-relaxed"
            rows={3}
            placeholder={PLACEHOLDER}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAiSubmit(e); }}
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-gray-400 dark:text-slate-500">
              Plain text, WhatsApp, or math like{' '}
              <code className="bg-gray-100 dark:bg-slate-700 px-1 rounded text-[11px]">200+32+76</code>
            </p>
            <button type="submit" disabled={loading || !text.trim()} className="btn-primary shrink-0 flex items-center gap-1.5">
              {loading
                ? <><Loader2 size={13} className="animate-spin" /> Parsing…</>
                : <><Sparkles size={13} /> Parse</>}
            </button>
          </div>
        </form>
      )}

      {/* Manual tab ───────────────────────────────── */}
      {tab === 'manual' && (
        <form onSubmit={handleManualSubmit} className="space-y-3">

          {/* Row 1: Amount + Category + Subcategory */}
          <div className="grid grid-cols-3 gap-2">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-400 dark:text-slate-500 pointer-events-none select-none">
                {currency}
              </span>
              <input
                type="number" step="0.01" min="0.01" required autoFocus
                className="input w-full pl-11"
                placeholder="0.00"
                value={amount}
                onChange={e => setAmount(e.target.value)}
              />
            </div>

            <div className="flex gap-1 min-w-0">
              {addingCat ? (
                <InlineAdd placeholder="Category name" onConfirm={handleNewCategory} onCancel={() => setAddingCat(false)} />
              ) : (
                <>
                  <select className="input flex-1" value={category}
                    onChange={e => { setCategory(e.target.value); setSubcategory(''); }}>
                    {catList.map(c => (
                      <option key={c.name} value={c.name}>{c.icon ? `${c.icon} ${c.name}` : c.name}</option>
                    ))}
                  </select>
                  <button type="button" onClick={() => setAddingCat(true)}
                    className="shrink-0 w-8 flex items-center justify-center rounded-lg border border-dashed border-gray-300 dark:border-slate-600 text-gray-400 hover:text-brand-500 hover:border-brand-400 transition-colors">
                    <Plus size={13} />
                  </button>
                </>
              )}
            </div>

            <div className="flex gap-1 min-w-0">
              {addingSubcat ? (
                <InlineAdd placeholder={`Under ${category}`} onConfirm={handleNewSubcategory} onCancel={() => setAddingSubcat(false)} />
              ) : (
                <>
                  <select className="input flex-1" value={subcategory} onChange={e => setSubcategory(e.target.value)}>
                    <option value="">No subcategory</option>
                    {subcats.map(s => { const n = s.name || s; return <option key={n} value={n}>{n}</option>; })}
                  </select>
                  <button type="button" onClick={() => setAddingSubcat(true)}
                    className="shrink-0 w-8 flex items-center justify-center rounded-lg border border-dashed border-gray-300 dark:border-slate-600 text-gray-400 hover:text-brand-500 hover:border-brand-400 transition-colors">
                    <Plus size={13} />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Row 2: Date + Description */}
          <div className="grid grid-cols-3 gap-2">
            <input
              type="date" required
              className="input"
              value={date}
              onChange={e => setDate(e.target.value)}
            />
            <input
              type="text" maxLength={80}
              className="input col-span-2"
              placeholder="Description (optional)"
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>

          {/* Row 3: Submit */}
          <div className="grid grid-cols-3 gap-2">
            <button type="submit" disabled={saving || !amount} className="btn-primary col-start-3 flex items-center justify-center gap-1.5">
              {saving
                ? <><Loader2 size={13} className="animate-spin" /> Saving…</>
                : <><Send size={13} /> Add Expense</>}
            </button>
          </div>

        </form>
      )}
    </div>
  );
}
