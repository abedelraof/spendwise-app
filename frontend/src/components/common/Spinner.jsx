export default function Spinner({ size = 'md' }) {
  const s = size === 'sm' ? 'w-3.5 h-3.5' : size === 'lg' ? 'w-8 h-8' : 'w-5 h-5';
  return (
    <div className={`${s} border-2 border-brand-200 dark:border-brand-800 border-t-brand-600 dark:border-t-brand-400 rounded-full animate-spin`} />
  );
}
