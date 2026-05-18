export const getDashboardStats = (api) =>
  api.get('/reports/dashboard-stats').then(r => r.data);

export const getMonthlyByCategory = (api, year, month) =>
  api.get('/reports/monthly-by-category', { params: { year, month } }).then(r => r.data);

export const getSpendingTrend = (api, startDate, endDate) =>
  api.get('/reports/spending-trend', { params: { startDate, endDate } }).then(r => r.data);

export const getCategoryBreakdown = (api, startDate, endDate) =>
  api.get('/reports/category-breakdown', { params: { startDate, endDate } }).then(r => r.data);

export const getTopDays = (api, startDate, endDate, limit) =>
  api.get('/reports/top-days', { params: { startDate, endDate, limit } }).then(r => r.data);

export const exportCsv = (api, params) =>
  api.get('/reports/export-csv', { params, responseType: 'blob' }).then(r => r.data);
