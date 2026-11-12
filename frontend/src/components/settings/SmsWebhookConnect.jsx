import { useState, useEffect, useCallback } from 'react';
import { MessageSquare, CheckCircle, Copy, RefreshCw, Power } from 'lucide-react';
import { getSmsWebhook, enableSmsWebhook, disableSmsWebhook } from '../../api/smsWebhookApi';
import { showToast } from '../common/Toast';
import Spinner from '../common/Spinner';

export default function SmsWebhookConnect({ api }) {
  const [hook, setHook]       = useState(null); // { enabled, url, template, last_used_at }
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState(false);

  const refresh = useCallback(async () => {
    try { setHook(await getSmsWebhook(api)); }
    catch { showToast('Failed to load SMS webhook', 'error'); }
  }, [api]);

  useEffect(() => { refresh().finally(() => setLoading(false)); }, [refresh]);

  async function run(fn, okMsg, failMsg) {
    setBusy(true);
    try { setHook(await fn(api)); if (okMsg) showToast(okMsg); }
    catch { showToast(failMsg, 'error'); }
    setBusy(false);
  }

  async function handleDisable() {
    if (!window.confirm('Turn off the SMS webhook? Your current link will stop working.')) return;
    setBusy(true);
    try { await disableSmsWebhook(api); await refresh(); showToast('SMS webhook turned off'); }
    catch { showToast('Failed to turn it off', 'error'); }
    setBusy(false);
  }

  function handleRotate() {
    if (!window.confirm('Generate a new link? The old one stops working immediately, so you must update your phone automation.')) return;
    run(enableSmsWebhook, 'New link generated', 'Failed to generate a new link');
  }

  async function copy() {
    try { await navigator.clipboard.writeText(hook.template); showToast('Link copied'); }
    catch { showToast('Could not copy — select the link and copy it manually', 'warning'); }
  }

  if (loading) return <div className="flex justify-center py-4"><Spinner size="sm" /></div>;

  if (!hook?.enabled) {
    return (
      <div className="space-y-4">
        <p className="text-xs text-gray-400 dark:text-slate-500 leading-relaxed">
          Get a private link that your phone can call every time a bank SMS arrives. ExpenseBeam reads the message,
          works out whether it is an <strong>expense</strong> or <strong>income</strong>, and queues it under
          Transactions → Pending for you to confirm. OTPs, promos and balance notices are ignored.
        </p>
        <button onClick={() => run(enableSmsWebhook, 'SMS webhook enabled', 'Failed to enable')} disabled={busy} className="btn-primary">
          {busy ? <Spinner size="sm" /> : <MessageSquare size={13} />} Enable SMS webhook
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-sm bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 rounded-xl">
          <CheckCircle size={14} /> SMS webhook is on
        </div>
        <span className="text-xs text-gray-400 dark:text-slate-500">
          {hook.last_used_at ? `Last message received ${new Date(hook.last_used_at).toLocaleString()}` : 'No messages received yet'}
        </span>
      </div>

      <div>
        <label className="label">Your private link</label>
        <div className="flex gap-2">
          <input readOnly value={hook.template} onFocus={e => e.target.select()}
            className="input font-mono text-xs flex-1 min-w-0" />
          <button onClick={copy} className="btn-secondary shrink-0"><Copy size={13} /> Copy</button>
        </div>
        <p className="text-xs text-amber-600 dark:text-amber-400 mt-1.5">
          Anyone with this link can add pending transactions to your account. Keep it private — nothing is saved until you confirm it.
        </p>
      </div>

      <div className="text-xs text-gray-500 dark:text-slate-400 leading-relaxed bg-gray-50 dark:bg-slate-700/30 rounded-xl p-3 space-y-1">
        <p className="font-medium text-gray-700 dark:text-slate-300">Set it up on your phone</p>
        <p>
          In an automation app (Tasker, MacroDroid, iOS Shortcuts…) trigger on incoming SMS that contain
          {' '}<code className="font-mono">EGP</code>, then send an HTTP <strong>GET</strong> to the link above and put the
          URL-encoded SMS text right after <code className="font-mono">?msg=</code>.
        </p>
      </div>

      <div className="flex gap-2 flex-wrap">
        <button onClick={handleRotate} disabled={busy} className="btn-secondary">
          <RefreshCw size={13} /> New link
        </button>
        <button onClick={handleDisable} disabled={busy} className="btn-secondary">
          <Power size={13} /> Turn off
        </button>
      </div>
    </div>
  );
}
