import { useState } from 'react';
import { Sparkles, Loader2, PenLine, Plus, Check, X, Zap } from 'lucide-react';
import TagInput from '../common/TagInput';

const PLACEHOLDER = `Paste expenses in any format:

Plain text:  "spent 150 on groceries yesterday and 50 on coffee"
WhatsApp:    [5/7/2026 6:19 AM] Name: Transportation 200+32+80
Multi-day:   Date: 1-May-2026 ... (overrides message date)`;

const CATEGORIES = ['Food','Transport','Housing','Entertainment','Health','Shopping','Education','Utilities','Other'];

function today() { return new Date().toISOString().split('T')[0]; }

/* ── Manual entry form (shared across all styles) ───────────────────────── */
function ManualForm({ categories = [], currency = 'EGP', onAdd, saving, onCreateCategory, onCreateSubcategory, styleId }) {
  const catOptions = categories.length ? categories.map(c => c.name) : CATEGORIES;
  const catMap     = Object.fromEntries(categories.map(c => [c.name, c]));

  const blank = () => ({
    amount: '', date: today(),
    category: catOptions[0] || 'Food', subcategory: '',
    description: '', notes: '', tags: '',
  });

  const [form,          setForm]          = useState(blank);
  const [addingCat,     setAddingCat]     = useState(false);
  const [addingSubcat,  setAddingSubcat]  = useState(false);
  const [newCatName,    setNewCatName]    = useState('');
  const [newSubcatName, setNewSubcatName] = useState('');
  const [catSaving,     setCatSaving]     = useState(false);
  const [subcatSaving,  setSubcatSaving]  = useState(false);

  const set        = (field, val) => setForm(f => ({ ...f, [field]: val }));
  const currentCat = catMap[form.category];
  const subcats    = currentCat?.subcategories || [];

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.amount || Number(form.amount) <= 0) return;
    await onAdd({ ...form, currency, exchange_rate: 1, amount: parseFloat(form.amount) });
    setForm(blank());
  }

  async function handleCreateCat() {
    if (!newCatName.trim() || !onCreateCategory) return;
    setCatSaving(true);
    try {
      const newCat = await onCreateCategory(newCatName.trim());
      if (newCat?.name) set('category', newCat.name);
      setAddingCat(false); setNewCatName('');
    } finally { setCatSaving(false); }
  }

  async function handleCreateSubcat() {
    if (!newSubcatName.trim() || !onCreateSubcategory || !currentCat?.id) return;
    setSubcatSaving(true);
    try {
      await onCreateSubcategory(currentCat.id, newSubcatName.trim());
      set('subcategory', newSubcatName.trim());
      setAddingSubcat(false); setNewSubcatName('');
    } finally { setSubcatSaving(false); }
  }

  function AddRow({ value, onChange, onConfirm, onCancel, isSaving, placeholder }) {
    return (
      <div className="flex gap-1.5">
        <input autoFocus type="text" className="input flex-1 text-xs" placeholder={placeholder}
          value={value} onChange={e => onChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onConfirm(); } if (e.key === 'Escape') onCancel(); }} />
        <button type="button" onClick={onConfirm} disabled={isSaving || !value.trim()}
          className="px-2.5 rounded-lg bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-40 transition-colors shrink-0">
          {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
        </button>
        <button type="button" onClick={onCancel}
          className="px-2.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors shrink-0">
          <X size={12} />
        </button>
      </div>
    );
  }

  // Style 4 overrides
  const isDark4   = styleId === 4;
  const inputCls  = isDark4
    ? 'w-full rounded-lg border border-gray-700 bg-gray-800 text-gray-100 px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all placeholder:text-gray-600'
    : 'input';
  const labelCls  = isDark4
    ? 'block text-xs font-mono font-semibold text-gray-500 uppercase tracking-wider mb-1.5'
    : 'label';
  const newBtnCls = isDark4
    ? 'flex items-center gap-0.5 text-[11px] font-mono font-medium text-emerald-500 hover:text-emerald-400 transition-colors'
    : 'flex items-center gap-0.5 text-[11px] font-medium text-brand-500 hover:text-brand-600 transition-colors';
  const submitCls = isDark4
    ? 'flex items-center justify-center gap-1.5 w-full px-4 py-2.5 rounded-lg text-xs font-mono font-bold bg-emerald-500 text-gray-950 hover:bg-emerald-400 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed'
    : 'flex items-center justify-center gap-1.5 w-full px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-brand-500 to-violet-500 text-white shadow-md hover:from-brand-600 hover:to-violet-600 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100';

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Amount *</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-400 pointer-events-none select-none">{currency}</span>
            <input type="number" className={`${inputCls} pl-10`} placeholder="0.00" step="0.01" min="0.01"
              value={form.amount} onChange={e => set('amount', e.target.value)} required />
          </div>
        </div>
        <div>
          <label className={labelCls}>Date *</label>
          <input type="date" className={inputCls} value={form.date} onChange={e => set('date', e.target.value)} required />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className={`${labelCls} !mb-0`}>Category</label>
            {!addingCat && (
              <button type="button" onClick={() => { setAddingCat(true); setNewCatName(''); }} className={newBtnCls}>
                <Plus size={11} /> New
              </button>
            )}
          </div>
          {addingCat ? (
            <AddRow value={newCatName} onChange={setNewCatName} onConfirm={handleCreateCat} onCancel={() => setAddingCat(false)} isSaving={catSaving} placeholder="Category name…" />
          ) : (
            <select className={inputCls} value={form.category} onChange={e => { set('category', e.target.value); set('subcategory', ''); }}>
              {catOptions.map(c => <option key={c}>{c}</option>)}
            </select>
          )}
        </div>
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className={`${labelCls} !mb-0`}>Subcategory</label>
            {!addingSubcat && (
              <button type="button" onClick={() => { setAddingSubcat(true); setNewSubcatName(''); }} className={newBtnCls}>
                <Plus size={11} /> New
              </button>
            )}
          </div>
          {addingSubcat ? (
            <AddRow value={newSubcatName} onChange={setNewSubcatName} onConfirm={handleCreateSubcat} onCancel={() => setAddingSubcat(false)} isSaving={subcatSaving} placeholder={`Under "${form.category}"…`} />
          ) : subcats.length ? (
            <select className={inputCls} value={form.subcategory} onChange={e => set('subcategory', e.target.value)}>
              <option value="">— none —</option>
              {subcats.map(s => <option key={s.name || s} value={s.name || s}>{s.name || s}</option>)}
            </select>
          ) : (
            <input type="text" className={inputCls} placeholder="e.g. Lunch" value={form.subcategory} onChange={e => set('subcategory', e.target.value)} />
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Description</label>
          <input type="text" className={inputCls} placeholder="Short label" maxLength={60} value={form.description} onChange={e => set('description', e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Notes</label>
          <input type="text" className={inputCls} placeholder="Optional" value={form.notes} onChange={e => set('notes', e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 items-end">
        <div>
          <label className={labelCls}>Tags</label>
          <TagInput value={form.tags} onChange={v => set('tags', v)} />
        </div>
        <button type="submit" disabled={saving || !form.amount} className={submitCls}>
          {saving ? <><Loader2 size={13} className="animate-spin" /> Saving…</> : <><PenLine size={13} /> Add Expense</>}
        </button>
      </div>
    </form>
  );
}

/* ── Shared AI parse form ────────────────────────────────────────────────── */
function AiForm({ text, setText, loading, onParse,
  textareaCls = '', btnCls = '', hintCls = '', codeCls = '' }) {
  return (
    <form onSubmit={e => { e.preventDefault(); if (text.trim()) { onParse(text); setText(''); } }} className="space-y-3">
      <textarea className={textareaCls} rows={5} placeholder={PLACEHOLDER} value={text} onChange={e => setText(e.target.value)} />
      <div className="flex items-center justify-between gap-3">
        <p className={hintCls}>
          Plain text, WhatsApp, math like <code className={codeCls}>200+32+76</code>
        </p>
        <button type="submit" disabled={loading || !text.trim()} className={btnCls}>
          {loading ? <><Loader2 size={13} className="animate-spin" /> Parsing…</> : <><Sparkles size={13} /> Parse with AI</>}
        </button>
      </div>
    </form>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   STYLE 1 — "Aurora"  (vibrant purple-violet, floating pill tabs)
══════════════════════════════════════════════════════════════════════ */
function Style1({ tab, setTab, text, setText, loading, saving, onParse, categories, currency, onAdd, onCreateCategory, onCreateSubcategory }) {
  return (
    <div className="card overflow-hidden">
      <div className="relative overflow-hidden bg-gradient-to-r from-violet-600 via-brand-500 to-purple-600 px-5 pt-5 pb-14">
        <div className="absolute -top-8 -right-8 w-36 h-36 bg-white/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-4 w-24 h-24 bg-fuchsia-400/20 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute top-2 right-16 w-8 h-8 bg-white/15 rounded-full blur-md pointer-events-none" />
        <div className="relative flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center ring-1 ring-white/30 shadow-lg shrink-0">
            <Sparkles size={19} className="text-white" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white tracking-tight">Log Expense</h3>
            <p className="text-[11px] text-white/60 mt-0.5">AI-powered · any format</p>
          </div>
          <span className="ml-auto text-[10px] font-semibold bg-white/20 text-white px-2.5 py-1 rounded-full ring-1 ring-white/20 shrink-0">
            ✦ Smart Parse
          </span>
        </div>
      </div>

      <div className="px-4 -mt-6 mb-5 relative z-10">
        <div className="flex gap-1 p-1 bg-white dark:bg-slate-800 rounded-2xl shadow-lg ring-1 ring-gray-100 dark:ring-slate-700">
          {[['ai', Sparkles, 'AI Parse'], ['manual', PenLine, 'Manual Entry']].map(([id, Icon, label]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                tab === id ? 'bg-gradient-to-r from-violet-500 to-brand-500 text-white shadow-sm' : 'text-gray-400 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-300'
              }`}>
              <Icon size={12} /> {label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 pb-5">
        {tab === 'ai' ? (
          <AiForm text={text} setText={setText} loading={loading} onParse={onParse}
            textareaCls="w-full rounded-2xl border-2 border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/40 text-xl leading-8 tracking-wide resize-y text-gray-900 dark:text-white font-medium px-5 py-4 focus:outline-none focus:border-brand-400 dark:focus:border-brand-500 focus:ring-4 focus:ring-brand-400/20 focus:bg-white dark:focus:bg-slate-800 focus:shadow-lg focus:shadow-brand-500/10 placeholder:text-gray-300 dark:placeholder:text-slate-600 placeholder:text-sm placeholder:leading-relaxed placeholder:tracking-normal placeholder:font-mono placeholder:font-normal transition-all duration-300"
            btnCls="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-violet-500 to-brand-500 text-white shadow-md hover:from-violet-600 hover:to-brand-600 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            hintCls="text-[11px] text-gray-400 dark:text-slate-500 leading-relaxed"
            codeCls="bg-gray-100 dark:bg-slate-700 px-1 py-0.5 rounded text-[10px]"
          />
        ) : (
          <ManualForm styleId={1} categories={categories} currency={currency} onAdd={onAdd} saving={saving} onCreateCategory={onCreateCategory} onCreateSubcategory={onCreateSubcategory} />
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   STYLE 2 — "Slate Glass"  (atmospheric dark card, cyan accents)
══════════════════════════════════════════════════════════════════════ */
function Style2({ tab, setTab, text, setText, loading, saving, onParse, categories, currency, onAdd, onCreateCategory, onCreateSubcategory }) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 to-indigo-950 shadow-2xl ring-1 ring-white/10">
      <div className="pointer-events-none absolute -top-16 -left-16 w-56 h-56 bg-cyan-500/10 rounded-full blur-3xl" />
      <div className="pointer-events-none absolute top-0 right-0 w-40 h-40 bg-violet-500/10 rounded-full blur-2xl" />

      <div className="relative px-5 pt-5 pb-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/20 ring-1 ring-cyan-400/30 flex items-center justify-center shrink-0">
            <Zap size={18} className="text-cyan-400" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white tracking-tight">Log Expense</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">AI-powered · any format</p>
          </div>
          <span className="ml-auto text-[10px] font-semibold text-cyan-400 bg-cyan-400/10 ring-1 ring-cyan-400/20 px-2.5 py-1 rounded-full shrink-0">
            ✦ Smart Parse
          </span>
        </div>
        <div className="mt-4 flex gap-0.5 p-0.5 bg-white/5 rounded-xl ring-1 ring-white/10">
          {[['ai', Sparkles, 'AI Parse'], ['manual', PenLine, 'Manual']].map(([id, Icon, label]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-[10px] text-xs font-semibold transition-all ${
                tab === id ? 'bg-cyan-500/20 text-cyan-300 ring-1 ring-cyan-400/30' : 'text-slate-500 hover:text-slate-300'
              }`}>
              <Icon size={12} /> {label}
            </button>
          ))}
        </div>
      </div>

      <div className="relative px-5 py-5">
        {tab === 'ai' ? (
          <AiForm text={text} setText={setText} loading={loading} onParse={onParse}
            textareaCls="w-full rounded-xl border border-white/10 bg-white/5 text-slate-200 font-medium text-lg leading-7 tracking-wide resize-y px-4 py-3.5 focus:outline-none focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/20 focus:bg-white/8 placeholder:text-slate-600 placeholder:text-sm placeholder:font-mono placeholder:font-normal placeholder:leading-relaxed placeholder:tracking-normal transition-all duration-300"
            btnCls="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-cyan-500 text-slate-900 hover:bg-cyan-400 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-cyan-500/30"
            hintCls="text-[11px] text-slate-500 leading-relaxed"
            codeCls="bg-white/10 px-1 py-0.5 rounded text-[10px] text-cyan-400"
          />
        ) : (
          <ManualForm styleId={2} categories={categories} currency={currency} onAdd={onAdd} saving={saving} onCreateCategory={onCreateCategory} onCreateSubcategory={onCreateSubcategory} />
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   STYLE 3 — "Sunrise"  (warm amber-rose, rounded pills, friendly)
══════════════════════════════════════════════════════════════════════ */
function Style3({ tab, setTab, text, setText, loading, saving, onParse, categories, currency, onAdd, onCreateCategory, onCreateSubcategory }) {
  return (
    <div className="card overflow-hidden">
      <div className="relative overflow-hidden bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 px-5 pt-5 pb-14">
        <div className="pointer-events-none absolute -top-6 -right-6 w-32 h-32 bg-white/15 rounded-full blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-8 w-20 h-20 bg-yellow-300/20 rounded-full blur-2xl" />
        <div className="pointer-events-none absolute top-4 right-24 w-5 h-5 bg-white/30 rounded-full blur-sm" />
        <div className="relative flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/25 backdrop-blur-sm flex items-center justify-center ring-1 ring-white/40 shadow-lg shrink-0">
            <span className="text-xl">💸</span>
          </div>
          <div>
            <h3 className="text-base font-bold text-white tracking-tight">Log Expense</h3>
            <p className="text-[11px] text-white/70 mt-0.5">AI-powered · any format</p>
          </div>
          <span className="ml-auto text-[10px] font-semibold bg-black/20 text-white px-2.5 py-1 rounded-full shrink-0">✨ Smart</span>
        </div>
      </div>

      <div className="px-4 -mt-6 mb-5 relative z-10">
        <div className="flex gap-1 p-1 bg-white dark:bg-slate-800 rounded-full shadow-lg ring-1 ring-gray-100 dark:ring-slate-700">
          {[['ai', '✨', 'AI Parse'], ['manual', '✏️', 'Manual']].map(([id, emoji, label]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-full text-xs font-semibold transition-all ${
                tab === id ? 'bg-gradient-to-r from-amber-400 to-rose-500 text-white shadow-sm' : 'text-gray-400 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-300'
              }`}>
              <span>{emoji}</span> {label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 pb-5">
        {tab === 'ai' ? (
          <AiForm text={text} setText={setText} loading={loading} onParse={onParse}
            textareaCls="w-full rounded-2xl border-2 border-orange-100 dark:border-orange-900/30 bg-orange-50/50 dark:bg-orange-900/10 text-xl leading-8 tracking-wide resize-y text-gray-900 dark:text-white font-medium px-5 py-4 focus:outline-none focus:border-orange-400 dark:focus:border-orange-500 focus:ring-4 focus:ring-orange-400/20 focus:bg-white dark:focus:bg-slate-800 placeholder:text-orange-200 dark:placeholder:text-slate-600 placeholder:text-sm placeholder:leading-relaxed placeholder:tracking-normal placeholder:font-mono placeholder:font-normal transition-all duration-300"
            btnCls="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold bg-gradient-to-r from-amber-400 to-rose-500 text-white shadow-md hover:from-amber-500 hover:to-rose-600 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            hintCls="text-[11px] text-gray-400 dark:text-slate-500 leading-relaxed"
            codeCls="bg-gray-100 dark:bg-slate-700 px-1 py-0.5 rounded text-[10px]"
          />
        ) : (
          <ManualForm styleId={3} categories={categories} currency={currency} onAdd={onAdd} saving={saving} onCreateCategory={onCreateCategory} onCreateSubcategory={onCreateSubcategory} />
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   STYLE 4 — "Terminal"  (always-dark, monospace, emerald, developer)
══════════════════════════════════════════════════════════════════════ */
function Style4({ tab, setTab, text, setText, loading, saving, onParse, categories, currency, onAdd, onCreateCategory, onCreateSubcategory }) {
  return (
    <div className="overflow-hidden rounded-xl bg-gray-950 ring-1 ring-gray-800 shadow-2xl">
      {/* Title bar */}
      <div className="px-4 py-2.5 bg-gray-900 border-b border-gray-800 flex items-center gap-3">
        <div className="flex gap-1.5 shrink-0">
          <div className="w-3 h-3 rounded-full bg-red-500/60" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
          <div className="w-3 h-3 rounded-full bg-emerald-500/60" />
        </div>
        <span className="text-xs font-mono text-gray-500 flex-1 text-center">
          expense-beam <span className="text-emerald-500">~</span> log
        </span>
        <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded ring-1 ring-emerald-500/20 shrink-0">● ready</span>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-gray-800">
        {[['ai', '⚡', 'ai-parse'], ['manual', '$_', 'manual-entry']].map(([id, sym, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-mono transition-all border-b-2 ${
              tab === id ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5' : 'border-transparent text-gray-600 hover:text-gray-400'
            }`}>
            <span className="text-gray-500">{sym}</span> {label}
          </button>
        ))}
      </div>

      <div className="p-4">
        {tab === 'ai' ? (
          <form onSubmit={e => { e.preventDefault(); if (text.trim()) { onParse(text); setText(''); } }} className="space-y-3">
            <div className="relative">
              <span className="absolute top-3.5 left-4 text-emerald-500 font-mono text-sm select-none pointer-events-none">›</span>
              <textarea
                className="w-full rounded-lg border border-gray-800 bg-gray-900 text-gray-100 font-mono text-sm leading-7 resize-y pl-8 pr-4 py-3 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 placeholder:text-gray-700 placeholder:font-mono placeholder:text-xs transition-all duration-200 caret-emerald-400"
                rows={5} placeholder={PLACEHOLDER} value={text} onChange={e => setText(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-mono text-gray-600">
                <span className="text-emerald-700">#</span> plain text · whatsapp · math{' '}
                <span className="text-gray-700 bg-gray-800 px-1 rounded">200+32+76</span>
              </p>
              <button type="submit" disabled={loading || !text.trim()}
                className="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-mono font-bold bg-emerald-500 text-gray-950 hover:bg-emerald-400 active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed">
                {loading ? <><Loader2 size={13} className="animate-spin" /> parsing…</> : <><Zap size={13} /> run parse</>}
              </button>
            </div>
          </form>
        ) : (
          <ManualForm styleId={4} categories={categories} currency={currency} onAdd={onAdd} saving={saving} onCreateCategory={onCreateCategory} onCreateSubcategory={onCreateSubcategory} />
        )}
      </div>
    </div>
  );
}

const STYLE_COMPONENTS = { 1: Style1, 2: Style2, 3: Style3, 4: Style4 };

/* ── Main panel ──────────────────────────────────────────────────────── */
export default function ExpenseInputPanel({
  onParse, onAdd, loading, saving,
  categories, currency,
  onCreateCategory, onCreateSubcategory,
}) {
  const [tab,  setTab]  = useState('ai');
  const [text, setText] = useState('');
  const [styleId, setStyleId] = useState(() => parseInt(localStorage.getItem('eb_panel_style') || '1'));

  // Listen for style changes triggered from Settings page
  useState(() => {
    const handler = () => setStyleId(parseInt(localStorage.getItem('eb_panel_style') || '1'));
    window.addEventListener('eb_panel_style_change', handler);
    return () => window.removeEventListener('eb_panel_style_change', handler);
  });

  const Panel = STYLE_COMPONENTS[styleId] || Style1;

  return (
    <Panel
        tab={tab} setTab={setTab}
        text={text} setText={setText}
        loading={loading} saving={saving}
        onParse={onParse}
        categories={categories} currency={currency}
        onAdd={onAdd}
        onCreateCategory={onCreateCategory}
        onCreateSubcategory={onCreateSubcategory}
      />
  );
}
