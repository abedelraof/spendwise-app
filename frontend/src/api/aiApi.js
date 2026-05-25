export const parseExpenses = (api, text) =>
  api.post('/ai/parse', { text }).then(r => r.data);

export const askQuestion = (api, question) =>
  api.post('/ai/ask', { question }).then(r => r.data);
