export const getRecurring = (api) =>
  api.get('/recurring').then(r => r.data);

export const createRecurring = (api, data) =>
  api.post('/recurring', data).then(r => r.data);

export const updateRecurring = (api, id, data) =>
  api.put(`/recurring/${id}`, data).then(r => r.data);

export const deleteRecurring = (api, id) =>
  api.delete(`/recurring/${id}`).then(r => r.data);

export const getUpcomingRecurring = (api, days = 7) =>
  api.get('/reports/upcoming-recurring', { params: { days } }).then(r => r.data);
