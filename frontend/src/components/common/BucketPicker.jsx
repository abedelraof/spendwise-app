import { useState, useRef, useEffect } from 'react';
import { ChevronDown, X } from 'lucide-react';

/**
 * Multi-select dropdown over the user's buckets, backed by an array of bucket IDs.
 * Adapted from the CategoryPicker pattern in Transactions.jsx (click-outside close,
 * checkbox list). `value` is number[]; `onChange(nextIds)`.
 */
export default function BucketPicker({ buckets, value = [], onChange, placeholder = 'No buckets', className = '' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const selected = buckets.filter(b => value.includes(b.id));

  const label = (() => {
    if (!selected.length) return <span className="text-gray-400 dark:text-slate-500">{placeholder}</span>;
    if (selected.length === 1) return `${selected[0].icon ?? ''} ${selected[0].name}`.trim();
    return `${selected.length} buckets`;
  })();

  function toggle(id) {
    onChange(value.includes(id) ? value.filter(x => x !== id) : [...value, id]);
  }
  function clearAll() { onChange([]); }

  return (
    <div ref={ref} className={`relative min-w-0 ${className}`}>
      <button type="button" onClick={() => setOpen(o => !o)}
        className="input !py-1.5 !text-xs w-full flex items-center justify-between gap-1 text-left">
        <span className="truncate text-xs flex items-center gap-1">
          {selected.slice(0, 3).map(b => (
            <span key={b.id} className="w-2 h-2 rounded-full shrink-0" style={{ background: b.color || '#7c3aed' }} />
          ))}
          {label}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {value.length > 0 && (
            <span onMouseDown={e => { e.stopPropagation(); clearAll(); }}
              className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-400">
              <X size={10} />
            </span>
          )}
          <ChevronDown size={11} className="text-gray-400" />
        </div>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-56 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-lg z-50 overflow-hidden">
          <div className="max-h-60 overflow-y-auto py-1">
            {buckets.length === 0 && (
              <p className="px-3 py-2 text-xs text-gray-400 dark:text-slate-500">No buckets yet — create one first.</p>
            )}
            {buckets.map(b => (
              <label key={b.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-slate-700/60 cursor-pointer">
                <input type="checkbox" checked={value.includes(b.id)} onChange={() => toggle(b.id)}
                  className="rounded accent-brand-600 cursor-pointer shrink-0" />
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: b.color || '#7c3aed' }} />
                <span className="text-xs font-medium text-gray-800 dark:text-slate-200 flex items-center gap-1.5">
                  {b.icon && <span>{b.icon}</span>}{b.name}
                </span>
              </label>
            ))}
          </div>
          {value.length > 0 && (
            <div className="border-t border-gray-100 dark:border-slate-700 px-3 py-2">
              <button onClick={clearAll} className="text-xs text-gray-400 hover:text-red-500 transition-colors">Clear selection</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
