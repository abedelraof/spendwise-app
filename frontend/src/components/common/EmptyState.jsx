export default function EmptyState({ icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center px-6">
      <div className="mb-4 text-gray-300 dark:text-slate-600">
        {typeof icon === 'string' ? <span className="text-5xl">{icon}</span> : icon}
      </div>
      <h3 className="text-sm font-semibold text-gray-600 dark:text-slate-400">{title}</h3>
      {description && <p className="text-xs text-gray-400 dark:text-slate-500 mt-1 max-w-xs">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
