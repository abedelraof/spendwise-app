export const parseExpenses = (api, text) =>
  api.post('/ai/parse', { text }).then(r => r.data);
