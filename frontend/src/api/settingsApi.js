export const getSettings = (api) =>
  api.get('/settings').then(r => r.data);

export const updateSettings = (api, data) =>
  api.put('/settings', data).then(r => r.data);
