import { useState } from 'react';

export default function TagInput({ value = '', onChange, wrapperClassName, tagClassName }) {
  const [input, setInput] = useState('');
  const tags = value ? value.split(',').map(t => t.trim()).filter(Boolean) : [];

  const addTag = (raw) => {
    const tag = raw.trim().replace(/^#/, '');
    if (!tag || tags.includes(tag)) return;
    onChange([...tags, tag].join(','));
    setInput('');
  };

  const removeTag = (tag) => onChange(tags.filter(t => t !== tag).join(','));

  return (
    <div className={wrapperClassName ?? "flex flex-wrap gap-1 items-center border border-gray-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-900 min-h-[38px] focus-within:ring-2 focus-within:ring-brand-500 focus-within:border-brand-400 transition-all duration-150"}>
      {tags.map(tag => (
        <span key={tag} className={tagClassName ?? "flex items-center gap-1 bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 text-xs px-2.5 py-0.5 rounded-full font-medium"}>
          #{tag}
          <button onClick={() => removeTag(tag)} className="text-brand-400 hover:text-brand-600 leading-none">&times;</button>
        </span>
      ))}
      <input
        className="flex-1 min-w-[80px] outline-none bg-transparent text-sm text-gray-900 dark:text-gray-100"
        placeholder="add tag..."
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(input); }
          if (e.key === 'Backspace' && !input && tags.length) removeTag(tags[tags.length - 1]);
        }}
      />
    </div>
  );
}
