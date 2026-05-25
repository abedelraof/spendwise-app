import { useState } from 'react';
import { MessageCircle, Sparkles, Loader2, Send } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import useApi from '../../hooks/useApi';
import { askQuestion } from '../../api/aiApi';
import { showToast } from '../common/Toast';

const SUGGESTIONS = [
  'What did I spend most on this month?',
  'Am I on track with my budgets?',
  'How does my spending compare to my income?',
];

export default function FinanceChat() {
  const api = useApi();
  const [question, setQuestion] = useState('');
  const [answer,   setAnswer]   = useState('');
  const [loading,  setLoading]  = useState(false);

  async function handleAsk(e) {
    e.preventDefault();
    const q = question.trim();
    if (!q || loading) return;
    setLoading(true);
    setAnswer('');
    try {
      const data = await askQuestion(api, q);
      setAnswer(data.answer);
    } catch (err) {
      if (err.response?.status === 402) {
        showToast('Add a Claude API key in Settings to use this feature', 'error');
      } else {
        showToast('Failed to get answer', 'error');
      }
    } finally { setLoading(false); }
  }

  function useSuggestion(s) {
    setQuestion(s);
    setAnswer('');
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

      {/* Suggestion pills */}
      {!answer && !loading && (
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTIONS.map(s => (
            <button key={s} onClick={() => useSuggestion(s)}
              className="text-xs px-2.5 py-1 rounded-full border border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:border-brand-300 hover:text-brand-600 dark:hover:border-brand-700 dark:hover:text-brand-400 transition-colors bg-white dark:bg-slate-800">
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleAsk} className="flex gap-2">
        <input
          className="input flex-1 text-sm"
          placeholder="Ask anything about your finances…"
          value={question}
          onChange={e => setQuestion(e.target.value)}
          disabled={loading}
        />
        <button type="submit" disabled={loading || !question.trim()} className="btn-primary !px-3">
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
        </button>
      </form>

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
          <button onClick={() => { setAnswer(''); setQuestion(''); }}
            className="mt-3 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 transition-colors">
            Ask another question
          </button>
        </div>
      )}
    </div>
  );
}
