import { useState } from 'react';
import { Sparkles, Loader2, PenLine, Plus } from 'lucide-react';
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
        <button type="submit" disabled={saving || !form.amount} className="btn-primary">
          {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : <><PenLine size={14} /> Add Expense</>}
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
      {/* Header */}
      <div className="px-5 pt-5 pb-3 flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center">
          <Plus size={14} className="text-brand-600 dark:text-brand-400" />
        </div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Log Expense</h3>
      </div>

      {/* Pill tab switcher */}
      <div className="px-5 pb-4">
        <div className="flex gap-1 p-1 bg-gray-100 dark:bg-slate-700/60 rounded-xl">
          <button
            onClick={() => setTab('ai')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
              tab === 'ai'
                ? 'bg-white dark:bg-slate-800 text-brand-600 dark:text-brand-400 shadow-sm'
                : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'
            }`}
          >
            <Sparkles size={12} /> AI Parse
          </button>
          <button
            onClick={() => setTab('manual')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
              tab === 'manual'
                ? 'bg-white dark:bg-slate-800 text-brand-600 dark:text-brand-400 shadow-sm'
                : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'
            }`}
          >
            <PenLine size={12} /> Manual Entry
          </button>
        </div>
      </div>

      <div className="px-5 pb-5">
        {tab === 'ai' ? (
          <form onSubmit={handleParse} className="space-y-3">
            <textarea
              className="input resize-y font-mono text-xs leading-relaxed"
              rows={5}
              placeholder={PLACEHOLDER}
              value={text}
              onChange={e => setText(e.target.value)}
            />
            <div className="flex items-center justify-between gap-4">
              <p className="text-xs text-gray-400 dark:text-slate-500">
                Supports plain text, WhatsApp messages, and math like{' '}
                <code className="bg-gray-100 dark:bg-slate-700 px-1 py-0.5 rounded text-[10px]">200+32+76</code>
              </p>
              <button type="submit" disabled={loading || !text.trim()} className="btn-primary shrink-0">
                {loading
                  ? <><Loader2 size={14} className="animate-spin" /> Parsing…</>
                  : <><Sparkles size={14} /> Parse with AI</>}
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
