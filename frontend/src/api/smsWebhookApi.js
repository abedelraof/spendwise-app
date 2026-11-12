export const getSmsWebhook = (api) =>
  api.get('/sms-webhook').then(r => r.data);

// Opt in, or rotate to a fresh link if already opted in (the old link stops working).
export const enableSmsWebhook = (api) =>
  api.post('/sms-webhook').then(r => r.data);

export const disableSmsWebhook = (api) =>
  api.delete('/sms-webhook').then(r => r.data);
