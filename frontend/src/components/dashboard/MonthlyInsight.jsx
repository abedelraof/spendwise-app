import { useState, useEffect, useCallback } from 'react';
import { Bot, RefreshCw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import useApi from '../../hooks/useApi';
import Spinner from '../common/Spinner';

export default function MonthlyInsight() {
  const api = useApi();
  const [insight, setInsight]   = useState(null);
  const [loading, setLoading]   = useState(false);
  const [noApiKey, setNoApiKey] = useState(false);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    try {
      const r = await api.get('/insights/monthly', { params: force ? { force: 'true' } : {} });
      setInsight(r.data.insight);
      setNoApiKey(false);
    } catch (err) {
      if (err.response?.status === 402) setNoApiKey(true);
    } finally { setLoading(false); }
  }, [api]);

  useEffect(() => { load(); }, [load]);

  if (noApiKey || (!loading && !insight)) return null;

  return (
    <div className="card p-5 bg-gradient-to-br from-brand-50 to-indigo-50 dark:from-brand-900/20 dark:to-indigo-900/20 border-brand-100 dark:border-brand-800/40">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-brand-700 dark:text-brand-300 flex items-center gap-2 text-sm">
          <Bot size={15} /> Monthly AI Insight
        </h3>
        <button
          onClick={() => load(true)}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs text-brand-500 hover:text-brand-700 dark:hover:text-brand-300 disabled:opacity-50 transition-colors"
          title="Regenerate insight"
        >
          {loading ? <Spinner size="sm" /> : <RefreshCw size={11} />}
          Refresh
        </button>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-brand-500 dark:text-brand-400">
          <Spinner size="sm" /> Generating insight…
        </div>
      ) : (
        <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed prose prose-sm prose-brand dark:prose-invert max-w-none">
          <ReactMarkdown>{insight}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}
