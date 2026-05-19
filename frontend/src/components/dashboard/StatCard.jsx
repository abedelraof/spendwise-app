export default function StatCard({ icon: Icon, label, value, sub, color = 'brand' }) {
  const palette = {
    brand: {
      card: 'bg-gradient-to-br from-brand-50 to-brand-100 dark:from-brand-900/50 dark:to-brand-800/30 border border-brand-100 dark:border-brand-700/40',
      icon: 'bg-brand-200/70 dark:bg-brand-700/60 text-brand-700 dark:text-brand-300',
      label: 'text-brand-400 dark:text-brand-500',
      value: 'text-brand-950 dark:text-white',
      sub: 'text-brand-500/80 dark:text-brand-400/70',
    },
    emerald: {
      card: 'bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-900/50 dark:to-emerald-800/30 border border-emerald-100 dark:border-emerald-700/40',
      icon: 'bg-emerald-200/70 dark:bg-emerald-700/60 text-emerald-700 dark:text-emerald-300',
      label: 'text-emerald-500/80 dark:text-emerald-500',
      value: 'text-emerald-950 dark:text-white',
      sub: 'text-emerald-600/70 dark:text-emerald-400/70',
    },
    amber: {
      card: 'bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-900/50 dark:to-amber-800/30 border border-amber-100 dark:border-amber-700/40',
      icon: 'bg-amber-200/70 dark:bg-amber-700/60 text-amber-700 dark:text-amber-300',
      label: 'text-amber-500/80 dark:text-amber-500',
      value: 'text-amber-950 dark:text-white',
      sub: 'text-amber-600/70 dark:text-amber-400/70',
    },
    sky: {
      card: 'bg-gradient-to-br from-sky-50 to-sky-100 dark:from-sky-900/50 dark:to-sky-800/30 border border-sky-100 dark:border-sky-700/40',
      icon: 'bg-sky-200/70 dark:bg-sky-700/60 text-sky-700 dark:text-sky-300',
      label: 'text-sky-500/80 dark:text-sky-500',
      value: 'text-sky-950 dark:text-white',
      sub: 'text-sky-600/70 dark:text-sky-400/70',
    },
    red: {
      card: 'bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/50 dark:to-red-800/30 border border-red-100 dark:border-red-700/40',
      icon: 'bg-red-200/70 dark:bg-red-700/60 text-red-700 dark:text-red-300',
      label: 'text-red-400/80 dark:text-red-500',
      value: 'text-red-950 dark:text-white',
      sub: 'text-red-600/70 dark:text-red-400/70',
    },
  };
  const c = palette[color] ?? palette.brand;

  return (
    <div className={`rounded-xl p-5 animate-fade-in ${c.card}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-xs font-semibold uppercase tracking-widest ${c.label}`}>{label}</p>
          <p className={`text-2xl font-bold mt-1.5 truncate ${c.value}`}>{value}</p>
          {sub && <p className={`text-xs mt-1 ${c.sub}`}>{sub}</p>}
        </div>
        {Icon && (
          <div className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${c.icon}`}>
            <Icon size={18} strokeWidth={2} />
          </div>
        )}
      </div>
    </div>
  );
}
