export const parseExpenses = (api, text) =>
  api.post('/ai/parse', { text }).then(r => r.data);

export const askQuestion = (api, question) =>
  api.post('/ai/ask', { question }).then(r => r.data);

// Turns an AI-endpoint error into a user-facing message. AI is free for everyone
// now, so the only expected gate is the monthly cost cap (429 quota_exceeded).
export function aiErrorMessage(err, fallback) {
  const { error: code, message } = err?.response?.data || {};
  if (code === 'quota_exceeded') {
    return message || 'You’ve reached this month’s AI limit — it resets on the 1st.';
  }
  return message || fallback;
}
