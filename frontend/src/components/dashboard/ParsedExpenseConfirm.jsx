import { useState } from 'react';
import Modal from '../common/Modal';
import TagInput from '../common/TagInput';

const CATEGORIES = ['Food','Transport','Housing','Entertainment','Health','Shopping','Education','Utilities','Other'];

export default function ParsedExpenseConfirm({ expenses: initial, categories = [], onConfirm, onClose }) {
  const [expenses, setExpenses] = useState(initial.map(e => ({ ...e, notes: '', tags: '' })));

  const update = (i, field, value) => {
    setExpenses(prev => prev.map((e, idx) => idx === i ? { ...e, [field]: value } : e));
  };

  const remove = (i) => setExpenses(prev => prev.filter((_, idx) => idx !== i));

  const catOptions = categories.length ? categories.map(c => c.name) : CATEGORIES;

  return (
    <Modal open onClose={onClose} title={`Confirm ${expenses.length} Expense${expenses.length !== 1 ? 's' : ''}`} size="lg">
      <div className="space-y-4">
        {expenses.map((e, i) => (
          <div key={i} className="border border-gray-100 dark:border-slate-700 rounded-xl p-4 space-y-3 bg-gray-50/50 dark:bg-slate-800/50">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Expense {i + 1}</span>
              <button onClick={() => remove(i)} className="text-red-400 hover:text-red-600 text-sm">Remove</button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
              <div>
                <label className="label">Amount</label>
                <input type="number" className="input" value={e.amount} step="0.01"
                  onChange={ev => update(i, 'amount', parseFloat(ev.target.value))} />
              </div>
              <div>
                <label className="label">Currency</label>
                <input type="text" className="input" value={e.currency}
                  onChange={ev => update(i, 'currency', ev.target.value)} />
              </div>
              <div>
                <label className="label">Exchange Rate</label>
                <input type="number" className="input" value={e.exchange_rate || 1} step="0.0001"
                  onChange={ev => update(i, 'exchange_rate', parseFloat(ev.target.value))} />
              </div>
              <div>
                <label className="label">Date</label>
                <input type="date" className="input" value={e.date}
                  onChange={ev => update(i, 'date', ev.target.value)} />
              </div>
              <div>
                <label className="label">Category</label>
                <select className="input" value={e.category} onChange={ev => update(i, 'category', ev.target.value)}>
                  {catOptions.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Subcategory</label>
                <input type="text" className="input" value={e.subcategory || ''}
                  onChange={ev => update(i, 'subcategory', ev.target.value)} />
              </div>
            </div>
            <div>
              <label className="label">Description</label>
              <input type="text" className="input" value={e.description || ''}
                onChange={ev => update(i, 'description', ev.target.value)} maxLength={60} />
            </div>
            <div>
              <label className="label">Notes</label>
              <input type="text" className="input" value={e.notes || ''}
                onChange={ev => update(i, 'notes', ev.target.value)} />
            </div>
            <div>
              <label className="label">Tags</label>
              <TagInput value={e.tags || ''} onChange={v => update(i, 'tags', v)} />
            </div>
          </div>
        ))}
        {expenses.length === 0 && (
          <p className="text-center text-gray-400 text-sm py-4">All expenses removed</p>
        )}
      </div>
      <div className="flex gap-3 mt-4 pt-4 border-t border-gray-100 dark:border-slate-700">
        <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
        <button onClick={() => onConfirm(expenses)} disabled={!expenses.length} className="btn-primary flex-1">
          Save {expenses.length} Expense{expenses.length !== 1 ? 's' : ''}
        </button>
      </div>
    </Modal>
  );
}
