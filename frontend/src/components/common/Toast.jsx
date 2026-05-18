import { useState, useEffect } from 'react';
import { CheckCircle, AlertCircle, AlertTriangle, X } from 'lucide-react';

let toastFn = null;
export function showToast(message, type = 'success') {
  toastFn?.(message, type);
}

const icons = {
  success: <CheckCircle size={15} className="text-emerald-400 shrink-0" />,
  error:   <AlertCircle size={15} className="text-red-400 shrink-0" />,
  warning: <AlertTriangle size={15} className="text-amber-400 shrink-0" />,
};

const styles = {
  success: 'bg-white dark:bg-slate-800 border-emerald-200 dark:border-emerald-800/60',
  error:   'bg-white dark:bg-slate-800 border-red-200 dark:border-red-800/60',
  warning: 'bg-white dark:bg-slate-800 border-amber-200 dark:border-amber-800/60',
};

export default function Toast() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    toastFn = (message, type) => {
      const id = Date.now();
      setToasts(prev => [...prev, { id, message, type }]);
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
    };
    return () => { toastFn = null; };
  }, []);

  const dismiss = (id) => setToasts(prev => prev.filter(t => t.id !== id));

  return (
    <div className="fixed bottom-5 right-5 flex flex-col gap-2 z-[100] pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg text-sm font-medium text-gray-900 dark:text-white pointer-events-auto animate-slide-up ${styles[t.type]}`}
        >
          {icons[t.type]}
          <span className="flex-1">{t.message}</span>
          <button onClick={() => dismiss(t.id)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
