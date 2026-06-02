export const seedDemoData = (api) =>
  api.post('/seed').then(r => r.data);
