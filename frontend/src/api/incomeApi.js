export const getIncomes    = (api, params = {}) => api.get('/income', { params }).then(r => r.data);
export const createIncomes = (api, incomes)     => api.post('/income', { incomes }).then(r => r.data);
export const updateIncome  = (api, id, fields)  => api.put(`/income/${id}`, fields).then(r => r.data);
export const deleteIncome  = (api, id)          => api.delete(`/income/${id}`).then(r => r.data);
