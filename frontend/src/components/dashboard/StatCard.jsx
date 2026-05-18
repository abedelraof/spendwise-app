export default function StatCard({ icon: Icon, label, value, sub, color = 'brand' }) {
  const palette = {
    brand:   { bg: 'bg-brand-50 dark:bg-brand-900/30',   text: 'text-brand-600 dark:text-brand-400' },
    emerald: { bg: 'bg-emerald-50 dark:bg-emerald-900/30', text: 'text-emerald-600 dark:text-emerald-400' },
    amber:   { bg: 'bg-amber-50 dark:bg-amber-900/30',   text: 'text-amber-600 dark:text-amber-400' },
    sky:     { bg: 'bg-sky-50 dark:bg-sky-900/30',       text: 'text-sky-600 dark:text-sky-400' },
  };
  const { bg, text } = palette[color] ?? palette.brand;

  return (
    <div className="card p-5 animate-fade-in">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-widest">{label}</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1.5 truncate">{value}</p>
          {sub && <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">{sub}</p>}
        </div>
        {Icon && (
          <div className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${bg}`}>
            <Icon size={18} className={text} strokeWidth={2} />
          </div>
        )}
      </div>
    </div>
  );
}
