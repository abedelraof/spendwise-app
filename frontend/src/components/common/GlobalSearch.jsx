import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Loader2 } from 'lucide-react';
import useApi from '../../hooks/useApi';

export default function GlobalSearch() {
  const [open, setOpen]       = useState(false);
  const [query, setQuery]     = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const api = useApi();
  const navigate  = useNavigate();
  const inputRef  = useRef(null);
  const timerRef  = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); setOpen(o => !o); }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
    else { setQuery(''); setResults([]); }
  }, [open]);

  const search = useCallback((q) => {
    clearTimeout(timerRef.current);
    if (!q.trim()) { setResults([]); return; }
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await api.get('/search', { params: { q, limit: 8 } });
        setResults(data.data.results);
      } catch { setResults([]); }
      setLoading(false);
    }, 300);
  }, [api]);

  const handleSelect = (r) => {
    setOpen(false);
    navigate(`/transactions?search=${encodeURIComponent(r.description || '')}`);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/50 backdrop-blur-sm animate-fade-in"
      onClick={() => setOpen(false)}
    >
      <div className="card w-full max-w-lg mx-4 shadow-2xl animate-scale-in overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-100 dark:border-slate-700/60">
          {loading ? <Loader2 size={15} className="text-brand-500 animate-spin shrink-0" /> : <Search size={15} className="text-gray-400 shrink-0" />}
          <input
            ref={inputRef}
            className="flex-1 outline-none bg-transparent text-gray-900 dark:text-gray-100 text-sm placeholder:text-gray-400"
            placeholder="Search expenses…"
            value={query}
            onChange={e => { setQuery(e.target.value); search(e.target.value); }}
          />
          <kbd className="text-xs text-gray-400 dark:text-slate-500 border border-gray-200 dark:border-slate-600 px-1.5 py-0.5 rounded-md">Esc</kbd>
        </div>

        {!loading && !results.length && query && (
          <div className="py-10 text-center text-sm text-gray-400 dark:text-slate-500">No results found</div>
        )}
        {!query && (
          <div className="py-10 text-center text-xs text-gray-300 dark:text-slate-600">Type to search across all expenses</div>
        )}

        {results.map(r => (
          <button
            key={r.id}
            onClick={() => handleSelect(r)}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-slate-700/40 text-left border-b border-gray-50 dark:border-slate-700/40 last:border-0 transition-colors"
          >
            <span className="text-xl">{r.category_icon || '📦'}</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{r.description || r.category_name}</div>
              <div className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{r.date} · {r.category_name}</div>
            </div>
            <div className="text-sm font-semibold text-gray-700 dark:text-gray-200 shrink-0">{r.amount} <span className="text-xs font-normal text-gray-400">{r.currency}</span></div>
          </button>
        ))}
      </div>
    </div>
  );
}
