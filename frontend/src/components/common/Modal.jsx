import { useEffect } from 'react';
import { X } from 'lucide-react';

export default function Modal({ open, onClose, title, children, size = 'md', hideHeader = false, backdrop }) {
  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape') onClose(); };
    if (open) window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [open, onClose]);

  if (!open) return null;
  const widths = { sm: 'sm:max-w-md', md: 'sm:max-w-xl', lg: 'sm:max-w-3xl', xl: 'sm:max-w-5xl' };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:px-4 sm:pb-4 bg-black/50 backdrop-blur-sm animate-fade-in overflow-hidden !mt-0">
      {backdrop}
      <div className={`w-full ${widths[size]} flex flex-col shadow-2xl bg-white dark:bg-slate-800 h-[92dvh] sm:h-auto sm:max-h-[90vh] rounded-t-2xl sm:rounded-xl animate-slide-up-full sm:animate-scale-in`}>

        {/* Mobile drag handle — hidden on desktop */}
        <div className="flex justify-center pt-3 pb-1 shrink-0 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-slate-600" />
        </div>

        {!hideHeader && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-slate-700/60 shrink-0">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h2>
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
            >
              <X size={15} />
            </button>
          </div>
        )}
        <div className="overflow-y-auto flex-1 p-5">{children}</div>
      </div>
    </div>
  );
}
