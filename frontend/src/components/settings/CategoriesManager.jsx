import { useState } from 'react';
import { showToast } from '../common/Toast';
import { createCategory, deleteCategory, createSubcategory, deleteSubcategory } from '../../api/categoriesApi';

export default function CategoriesManager({ categories, api, onRefresh }) {
  const [expanded, setExpanded] = useState(null);
  const [addingCat, setAddingCat] = useState(false);
  const [newCat, setNewCat] = useState({ name: '', icon: '📦', color: '#6b7280' });
  const [newSub, setNewSub] = useState({});

  const toggleExpand = (id) => setExpanded(e => e === id ? null : id);

  async function handleAddCategory(e) {
    e.preventDefault();
    if (!newCat.name.trim()) return;
    try {
      await createCategory(api, newCat);
      setNewCat({ name: '', icon: '📦', color: '#6b7280' });
      setAddingCat(false);
      onRefresh();
      showToast('Category added');
    } catch { showToast('Failed to add category', 'error'); }
  }

  async function handleDeleteCat(id) {
    if (!confirm('Delete this category? Expenses will keep their category name.')) return;
    try {
      await deleteCategory(api, id);
      onRefresh();
      showToast('Category deleted');
    } catch (err) {
      showToast(err.response?.data?.error || 'Cannot delete category', 'error');
    }
  }

  async function handleAddSub(e, catId) {
    e.preventDefault();
    const name = newSub[catId]?.trim();
    if (!name) return;
    try {
      await createSubcategory(api, catId, name);
      setNewSub(prev => ({ ...prev, [catId]: '' }));
      onRefresh();
    } catch { showToast('Failed to add subcategory', 'error'); }
  }

  async function handleDeleteSub(id) {
    try {
      await deleteSubcategory(api, id);
      onRefresh();
    } catch { showToast('Failed to delete subcategory', 'error'); }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium text-gray-900 dark:text-white">Categories</h3>
        <button onClick={() => setAddingCat(a => !a)} className="btn-secondary text-sm py-1">
          {addingCat ? 'Cancel' : '+ Add Category'}
        </button>
      </div>

      {addingCat && (
        <form onSubmit={handleAddCategory} className="flex gap-2 mb-3 items-end flex-wrap">
          <div>
            <label className="label">Icon</label>
            <input className="input w-16" value={newCat.icon} onChange={e => setNewCat(p => ({ ...p, icon: e.target.value }))} />
          </div>
          <div className="flex-1 min-w-[120px]">
            <label className="label">Name</label>
            <input className="input" placeholder="Category name" value={newCat.name}
              onChange={e => setNewCat(p => ({ ...p, name: e.target.value }))} />
          </div>
          <div>
            <label className="label">Color</label>
            <input type="color" className="w-10 h-9 rounded border border-gray-300 cursor-pointer" value={newCat.color}
              onChange={e => setNewCat(p => ({ ...p, color: e.target.value }))} />
          </div>
          <button type="submit" className="btn-primary">Add</button>
        </form>
      )}

      <div className="space-y-1">
        {categories.map(cat => (
          <div key={cat.id} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <div className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50"
              onClick={() => toggleExpand(cat.id)}>
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-sm"
                style={{ backgroundColor: cat.color + '33' }}>{cat.icon}</div>
              <span className="flex-1 text-sm font-medium text-gray-900 dark:text-white">{cat.name}</span>
              <span className="text-xs text-gray-400">{cat.subcategories?.length} subs</span>
              {cat.is_default
                ? <span className="text-xs text-gray-400">🔒</span>
                : <button onClick={e => { e.stopPropagation(); handleDeleteCat(cat.id); }}
                    className="text-red-400 hover:text-red-600 text-sm" title="Delete">🗑️</button>
              }
              <span className="text-gray-400 text-xs">{expanded === cat.id ? '▲' : '▼'}</span>
            </div>

            {expanded === cat.id && (
              <div className="border-t border-gray-100 dark:border-gray-700 px-3 py-2 bg-gray-50 dark:bg-gray-800/50">
                <div className="flex flex-wrap gap-1 mb-2">
                  {cat.subcategories?.map(sub => (
                    <span key={sub.id} className="flex items-center gap-1 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-full px-2 py-0.5 text-xs text-gray-700 dark:text-gray-300">
                      {sub.name}
                      <button onClick={() => handleDeleteSub(sub.id)} className="text-gray-400 hover:text-red-500">&times;</button>
                    </span>
                  ))}
                </div>
                <form onSubmit={e => handleAddSub(e, cat.id)} className="flex gap-2">
                  <input className="input flex-1 text-xs py-1" placeholder="New subcategory..."
                    value={newSub[cat.id] || ''}
                    onChange={e => setNewSub(prev => ({ ...prev, [cat.id]: e.target.value }))} />
                  <button type="submit" className="btn-primary text-xs py-1 px-2">Add</button>
                </form>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
