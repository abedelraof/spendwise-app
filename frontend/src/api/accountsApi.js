export const getAccounts    = (api)           => api.get('/accounts').then(r => r.data);
export const createAccount  = (api, data)     => api.post('/accounts', data).then(r => r.data);
export const updateAccount  = (api, id, data) => api.put(`/accounts/${id}`, data).then(r => r.data);
export const deleteAccount  = (api, id)       => api.delete(`/accounts/${id}`).then(r => r.data);
export const getHistory     = (api, id)       => api.get(`/accounts/${id}/history`).then(r => r.data);
export const recordBalances = (api, data)     => api.post('/accounts/balances', data).then(r => r.data);
export const getRates       = (api, base)     => api.get(`/rates?base=${encodeURIComponent(base)}`).then(r => r.data);
export const updateBalance    = (api, id, data) => api.put(`/accounts/balances/${id}`, data).then(r => r.data);
export const deleteBalance    = (api, id)       => api.delete(`/accounts/balances/${id}`).then(r => r.data);
export const reorderAccounts  = (api, order)    => api.put('/accounts/reorder', { order }).then(r => r.data);

export const getAccountGroups     = (api)           => api.get('/account-groups').then(r => r.data);
export const createAccountGroup   = (api, data)     => api.post('/account-groups', data).then(r => r.data);
export const updateAccountGroup   = (api, id, data) => api.put(`/account-groups/${id}`, data).then(r => r.data);
export const deleteAccountGroup   = (api, id)       => api.delete(`/account-groups/${id}`).then(r => r.data);
export const reorderAccountGroups = (api, order)    => api.put('/account-groups/reorder', { order }).then(r => r.data);
