export const getCategories = (api) =>
  api.get('/categories').then(r => r.data);

export const createCategory = (api, data) =>
  api.post('/categories', data).then(r => r.data);

export const deleteCategory = (api, id) =>
  api.delete(`/categories/${id}`).then(r => r.data);

export const createSubcategory = (api, categoryId, name) =>
  api.post(`/categories/${categoryId}/subcategories`, { name }).then(r => r.data);

export const deleteSubcategory = (api, id) =>
  api.delete(`/categories/subcategories/${id}`).then(r => r.data);
