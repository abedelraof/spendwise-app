import { useState, useEffect, useCallback, useRef } from 'react';
import { Send, CheckCircle, Unlink, Loader2 } from 'lucide-react';
import { getTelegramLink, createTelegramLink, deleteTelegramLink } from '../../api/telegramApi';
import { showToast } from '../common/Toast';
import Spinner from '../common/Spinner';

const POLL_INTERVAL_MS = 3000;

export default function TelegramConnect({ api }) {
  const [status, setStatus]   = useState(null); // { linked }
  const [pending, setPending] = useState(null); // { code, expires_at, deep_link }
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState(false);
  const pollRef = useRef(null);

  const refresh = useCallback(async () => {
    try {
      const s = await getTelegramLink(api);
      setStatus(s);
      return s;
    } catch {
      showToast('Failed to load Telegram status', 'error');
      return null;
    }
  }, [api]);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
    return () => clearInterval(pollRef.current);
  }, [refresh]);

  function stopPolling() {
    clearInterval(pollRef.current);
    pollRef.current = null;
  }

  async function handleConnect() {
    setBusy(true);
    try {
      const data = await createTelegramLink(api);
      setPending(data);

      const expiresAt = new Date(data.expires_at).getTime();
      pollRef.current = setInterval(async () => {
        if (Date.now() > expiresAt) { stopPolling(); setPending(null); return; }
        const s = await refresh();
        if (s?.linked) { stopPolling(); setPending(null); showToast('Telegram connected!'); }
      }, POLL_INTERVAL_MS);
    } catch {
      showToast('Failed to generate a linking code', 'error');
    }
    setBusy(false);
  }

  async function handleDisconnect() {
    setBusy(true);
    try {
      await deleteTelegramLink(api);
      stopPolling();
      setPending(null);
      await refresh();
      showToast('Telegram disconnected');
    } catch {
      showToast('Failed to disconnect', 'error');
    }
    setBusy(false);
  }

  if (loading) return <div className="flex justify-center py-4"><Spinner size="sm" /></div>;

  if (status?.linked) {
    return (
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-sm bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 rounded-xl">
          <CheckCircle size={14} /> Connected to Telegram
        </div>
        <button onClick={handleDisconnect} disabled={busy} className="btn-secondary shrink-0">
          {busy ? <Spinner size="sm" /> : <Unlink size={13} />} Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-400 dark:text-slate-500">
        Link your Telegram account to add expenses by chatting with the ExpenseBeam bot — send a message, confirm the parsed list, done.
      </p>

      {pending ? (
        <div className="flex items-start gap-3 p-3 bg-brand-50 dark:bg-brand-900/20 rounded-xl border border-brand-200 dark:border-brand-800/40">
          <Loader2 size={16} className="text-brand-500 mt-0.5 shrink-0 animate-spin" />
          <div className="space-y-2">
            <p className="text-xs text-brand-700 dark:text-brand-300 leading-relaxed">
              Open Telegram and tap the button below (or send <code className="font-mono">/start {pending.code}</code> to the bot). This code expires in 10 minutes.
            </p>
            {pending.deep_link && (
              <a href={pending.deep_link} target="_blank" rel="noreferrer" className="btn-primary inline-flex">
                <Send size={13} /> Open Telegram
              </a>
            )}
          </div>
        </div>
      ) : (
        <button onClick={handleConnect} disabled={busy} className="btn-primary">
          {busy ? <Spinner size="sm" /> : <Send size={13} />} Connect Telegram
        </button>
      )}
    </div>
  );
}
