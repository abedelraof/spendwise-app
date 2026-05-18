export const getBudgets = (api) =>
  api.get('/budgets').then(r => r.data);

export const createBudget = (api, data) =>
  api.post('/budgets', data).then(r => r.data);

export const updateBudget = (api, id, amount) =>
  api.put(`/budgets/${id}`, { amount }).then(r => r.data);

export const deleteBudget = (api, id) =>
  api.delete(`/budgets/${id}`).then(r => r.data);
