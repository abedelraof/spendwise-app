export const getExpenses = (api, params = {}) =>
  api.get('/expenses', { params }).then(r => r.data);

export const createExpenses = (api, expenses) =>
  api.post('/expenses', { expenses }).then(r => r.data);

export const updateExpense = (api, id, fields) =>
  api.put(`/expenses/${id}`, fields).then(r => r.data);

export const deleteExpense = (api, id) =>
  api.delete(`/expenses/${id}`).then(r => r.data);

export const bulkDeleteExpenses = (api, ids) =>
  api.delete('/expenses/bulk', { data: { ids } }).then(r => r.data);
