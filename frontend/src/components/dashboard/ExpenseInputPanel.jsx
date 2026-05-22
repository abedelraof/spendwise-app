import { useState } from 'react';
import { Sparkles, Loader2, PenLine } from 'lucide-react';
import TagInput from '../common/TagInput';

const PLACEHOLDER = `Paste expenses in any format:

Plain text:  "spent 150 on groceries yesterday and 50 on coffee"
WhatsApp:    [5/7/2026 6:19 AM] Name: Transportation 200+32+80
Multi-day:   Date: 1-May-2026 ... (overrides message date)`;

const CATEGORIES = ['Food','Transport','Housing','Entertainment','Health','Shopping','Education','Utilities','Other'];

function today() { return new Date().toISOString().split('T')[0]; }

function ManualForm({ categories = [], currency = 'EGP', onAdd, saving }) {
  const catOptions = categories.length ? categories.map(c => c.name) : CATEGORIES;
  const subcatMap = Object.fromEntries(categories.map(c => [c.name, c.subcategories || []]));

  const blank = () => ({
    amount: '', currency, exchange_rate: 1,
    date: today(), category: catOptions[0] || 'Food',
    subcategory: '', description: '', notes: '', tags: '',
  });

  const [form, setForm] = useState(blank);
  const set = (field, val) => setForm(f => ({ ...f, [field]: val }));

  const subcats = subcatMap[form.category] || [];

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.amount || Number(form.amount) <= 0) return;
    await onAdd({ ...form, amount: parseFloat(form.amount), exchange_rate: parseFloat(form.exchange_rate) || 1 });
    setForm(blank());
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <div>
          <label className="label">Amount *</label>
          <input type="number" className="input" placeholder="0.00" step="0.01" min="0.01"
            value={form.amount} onChange={e => set('amount', e.target.value)} required />
        </div>
        <div>
          <label className="label">Currency</label>
          <input type="text" className="input" placeholder="EGP"
            value={form.currency} onChange={e => set('currency', e.target.value)} />
        </div>
        <div>
          <label className="label">Exchange Rate</label>
          <input type="number" className="input" step="0.0001" min="0.0001"
            value={form.exchange_rate} onChange={e => set('exchange_rate', e.target.value)} />
        </div>
        <div>
          <label className="label">Date *</label>
          <input type="date" className="input"
            value={form.date} onChange={e => set('date', e.target.value)} required />
        </div>
        <div>
          <label className="label">Category</label>
          <select className="input" value={form.category} onChange={e => set('category', e.target.value)}>
            {catOptions.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Subcategory</label>
          {subcats.length ? (
            <select className="input" value={form.subcategory} onChange={e => set('subcategory', e.target.value)}>
              <option value="">— none —</option>
              {subcats.map(s => <option key={s.name || s} value={s.name || s}>{s.name || s}</option>)}
            </select>
          ) : (
            <input type="text" className="input" placeholder="e.g. Lunch"
              value={form.subcategory} onChange={e => set('subcategory', e.target.value)} />
          )}
        </div>
      </div>
      <div>
        <label className="label">Description</label>
        <input type="text" className="input" placeholder="Short label" maxLength={60}
          value={form.description} onChange={e => set('description', e.target.value)} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label className="label">Notes</label>
          <input type="text" className="input" placeholder="Optional notes"
            value={form.notes} onChange={e => set('notes', e.target.value)} />
        </div>
        <div>
          <label className="label">Tags</label>
          <TagInput value={form.tags} onChange={v => set('tags', v)} />
        </div>
      </div>
      <div className="flex justify-end pt-1">
        <button
          type="submit"
          disabled={saving || !form.amount}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold
            bg-gradient-to-r from-violet-500 to-brand-500 text-white shadow-md
            hover:from-violet-600 hover:to-brand-600 active:scale-95 transition-all
            disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
        >
          {saving ? <><Loader2 size={13} className="animate-spin" /> Saving…</> : <><PenLine size={13} /> Add Expense</>}
        </button>
      </div>
    </form>
  );
}

export default function ExpenseInputPanel({ onParse, onAdd, loading, saving, categories, currency }) {
  const [tab, setTab] = useState('ai');
  const [text, setText] = useState('');

  async function handleParse(e) {
    e.preventDefault();
    if (!text.trim()) return;
    await onParse(text);
    setText('');
  }

  return (
    <div className="card overflow-hidden">

      {/* Vibrant gradient hero header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-violet-600 via-brand-600 to-indigo-500 px-5 pt-5 pb-14">
        {/* Decorative blobs */}
        <div className="absolute -top-6 -right-6 w-28 h-28 bg-white/10 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute bottom-0 left-6 w-20 h-20 bg-white/10 rounded-full blur-xl pointer-events-none" />
        <div className="absolute top-3 right-20 w-6 h-6 bg-yellow-300/30 rounded-full blur-md pointer-events-none" />

        <div className="relative flex items-center gap-3">
          {/* Glowing icon */}
          <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center ring-1 ring-white/30 shadow-lg shrink-0">
            <Sparkles size={19} className="text-white" />
          </div>

          <div className="min-w-0">
            <h3 className="text-base font-bold text-white tracking-tight leading-tight">Log Expense</h3>
            <p className="text-[11px] text-white/60 mt-0.5">AI-powered · any format</p>
          </div>

          <div className="ml-auto shrink-0">
            <span className="text-[10px] font-semibold bg-white/20 text-white px-2.5 py-1 rounded-full backdrop-blur-sm ring-1 ring-white/20">
              ✦ Smart Parse
            </span>
          </div>
        </div>
      </div>

      {/* Floating pill tab switcher — overlaps gradient */}
      <div className="px-4 -mt-6 mb-5 relative z-10">
        <div className="flex gap-1 p-1 bg-white dark:bg-slate-800 rounded-2xl shadow-lg ring-1 ring-gray-100 dark:ring-slate-700">
          <button
            onClick={() => setTab('ai')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all ${
              tab === 'ai'
                ? 'bg-gradient-to-r from-violet-500 to-brand-500 text-white shadow-sm'
                : 'text-gray-400 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-300'
            }`}
          >
            <Sparkles size={12} /> AI Parse
          </button>
          <button
            onClick={() => setTab('manual')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all ${
              tab === 'manual'
                ? 'bg-gradient-to-r from-violet-500 to-brand-500 text-white shadow-sm'
                : 'text-gray-400 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-300'
            }`}
          >
            <PenLine size={12} /> Manual Entry
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="px-5 pb-5">
        {tab === 'ai' ? (
          <form onSubmit={handleParse} className="space-y-3">
            <textarea
              className="w-full rounded-xl border border-gray-200 dark:border-slate-700
                bg-gray-50 dark:bg-slate-800/60
                font-mono text-xs leading-relaxed resize-y
                text-gray-800 dark:text-slate-200
                px-3.5 py-3
                focus:outline-none focus:ring-2 focus:ring-violet-400/40 focus:border-violet-400
                placeholder:text-gray-400 dark:placeholder:text-slate-500
                transition-all"
              rows={5}
              placeholder={PLACEHOLDER}
              value={text}
              onChange={e => setText(e.target.value)}
            />
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] text-gray-400 dark:text-slate-500 leading-relaxed">
                Plain text, WhatsApp, math like{' '}
                <code className="bg-gray-100 dark:bg-slate-700 px-1 py-0.5 rounded text-[10px]">200+32+76</code>
              </p>
              <button
                type="submit"
                disabled={loading || !text.trim()}
                className="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold
                  bg-gradient-to-r from-violet-500 to-brand-500 text-white shadow-md
                  hover:from-violet-600 hover:to-brand-600 active:scale-95 transition-all
                  disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
              >
                {loading
                  ? <><Loader2 size={13} className="animate-spin" /> Parsing…</>
                  : <><Sparkles size={13} /> Parse with AI</>}
              </button>
            </div>
          </form>
        ) : (
          <ManualForm categories={categories} currency={currency} onAdd={onAdd} saving={saving} />
        )}
      </div>
    </div>
  );
}
