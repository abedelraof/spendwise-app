export const getBudgets = (api) =>
  api.get('/budgets').then(r => r.data);

export const createBudget = (api, data) =>
  api.post('/budgets', data).then(r => r.data);

export const updateBudget = (api, id, amount) =>
  api.put(`/budgets/${id}`, { amount }).then(r => r.data);

export const deleteBudget = (api, id) =>
  api.delete(`/budgets/${id}`).then(r => r.data);

export const getBudgetCap = (api) =>
  api.get('/budgets/cap').then(r => r.data);

export const setBudgetCap = (api, amount) =>
  api.put('/budgets/cap', { amount }).then(r => r.data);
