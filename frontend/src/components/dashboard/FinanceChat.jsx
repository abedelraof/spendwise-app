import { useState, useMemo } from 'react';
import { MessageCircle, Sparkles, Loader2, Send, RefreshCw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import useApi from '../../hooks/useApi';
import { askQuestion } from '../../api/aiApi';
import { showToast } from '../common/Toast';

const ALL_SUGGESTIONS = [
  'What did I spend most on this month?',
  'Am I on track with my budgets?',
  'How does my spending compare to my income?',
  'Which day had my highest spending this month?',
  'How much have I saved toward my goals?',
  'What are my top 3 expense categories?',
  'How much did I spend on food this month?',
  'What's my average daily spend this week?',
  'Do I have any budgets I'm about to exceed?',
  'How does this month compare to last month?',
  'What's my total income vs total expenses?',
  'Which account has the highest balance?',
];

function pickRandom(arr, n) {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

export default function FinanceChat() {
  const api = useApi();
  const [question,    setQuestion]    = useState('');
  const [answer,      setAnswer]      = useState('');
  const [loading,     setLoading]     = useState(false);
  const [seed,        setSeed]        = useState(0);

  // Pick 4 random suggestions; reshuffle when seed changes
  const suggestions = useMemo(
    () => pickRandom(ALL_SUGGESTIONS, 4),
    [seed] // eslint-disable-line react-hooks/exhaustive-deps
  );

  async function ask(q) {
    if (!q?.trim() || loading) return;
    setLoading(true);
    setAnswer('');
    try {
      const data = await askQuestion(api, q.trim());
      setAnswer(data.answer);
    } catch (err) {
      if (err.response?.status === 402) {
        showToast('Add a Claude API key in Settings to use this feature', 'error');
      } else {
        showToast('Failed to get answer', 'error');
      }
    } finally { setLoading(false); }
  }

  function handleAsk(e) {
    e.preventDefault();
    ask(question);
  }

  function reset() {
    setAnswer('');
    setQuestion('');
    setSeed(s => s + 1);
  }

  return (
    <div className="card p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 bg-brand-50 dark:bg-brand-900/30 rounded-lg flex items-center justify-center shrink-0">
          <MessageCircle size={14} className="text-brand-600 dark:text-brand-400" />
        </div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Ask About Your Finances</h3>
        <span className="ml-auto text-[10px] font-semibold text-brand-500 bg-brand-50 dark:bg-brand-900/30 px-2 py-0.5 rounded-full shrink-0">AI</span>
      </div>

      {/* Input — always visible */}
      <form onSubmit={handleAsk} className="flex gap-2">
        <input
          className="input flex-1 text-sm"
          placeholder="Ask anything about your finances…"
          value={question}
          onChange={e => setQuestion(e.target.value)}
          disabled={loading}
          autoComplete="off"
        />
        <button type="submit" disabled={loading || !question.trim()} className="btn-primary !px-3">
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
        </button>
      </form>

      {/* Suggestions — shown when idle */}
      {!answer && !loading && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-gray-400 dark:text-slate-500">
              Not sure what to ask? Try one of these:
            </p>
            <button
              onClick={() => setSeed(s => s + 1)}
              title="Refresh suggestions"
              className="p-1 rounded text-gray-300 dark:text-slate-600 hover:text-gray-500 dark:hover:text-slate-400 transition-colors">
              <RefreshCw size={11} />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {suggestions.map(s => (
              <button
                key={s}
                onClick={() => ask(s)}
                className="text-left text-xs px-3 py-2 rounded-lg border border-dashed border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:border-brand-300 dark:hover:border-brand-700 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-brand-50/50 dark:hover:bg-brand-900/10 transition-all leading-snug">
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Thinking state */}
      {loading && (
        <div className="flex items-center gap-2 text-sm text-gray-400 dark:text-slate-500">
          <Sparkles size={14} className="animate-pulse text-brand-400" />
          Analyzing your data…
        </div>
      )}

      {/* Answer */}
      {answer && !loading && (
        <div className="border-t border-gray-100 dark:border-slate-700/60 pt-4">
          <div className="prose prose-sm dark:prose-invert max-w-none text-gray-700 dark:text-slate-300
            prose-p:my-1.5 prose-ul:my-1.5 prose-li:my-0.5 prose-headings:text-gray-900 dark:prose-headings:text-white">
            <ReactMarkdown>{answer}</ReactMarkdown>
          </div>
          <button
            onClick={reset}
            className="mt-3 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 transition-colors">
            Ask another question
          </button>
        </div>
      )}
    </div>
  );
}
