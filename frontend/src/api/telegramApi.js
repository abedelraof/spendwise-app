export const getTelegramLink = (api) =>
  api.get('/telegram-link').then(r => r.data);

export const createTelegramLink = (api) =>
  api.post('/telegram-link').then(r => r.data);

export const deleteTelegramLink = (api) =>
  api.delete('/telegram-link').then(r => r.data);
