export const getGoals   = (api)           => api.get('/goals').then(r => r.data);
export const createGoal = (api, data)     => api.post('/goals', data).then(r => r.data);
export const updateGoal = (api, id, data) => api.put(`/goals/${id}`, data).then(r => r.data);
export const deleteGoal = (api, id)       => api.delete(`/goals/${id}`).then(r => r.data);
