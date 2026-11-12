export const getPending = (api) =>
  api.get('/pending').then(r => r.data);

// `edits` (all optional): { type, amount, currency, date, description, category, source }
export const confirmPending = (api, id, edits = {}) =>
  api.post(`/pending/${id}/confirm`, edits).then(r => r.data);

export const rejectPending = (api, id) =>
  api.post(`/pending/${id}/reject`).then(r => r.data);
