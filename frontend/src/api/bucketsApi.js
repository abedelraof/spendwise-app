export const getBuckets    = (api)           => api.get('/buckets').then(r => r.data);
export const createBucket  = (api, data)     => api.post('/buckets', data).then(r => r.data);
export const updateBucket  = (api, id, data) => api.put(`/buckets/${id}`, data).then(r => r.data);
export const deleteBucket  = (api, id)       => api.delete(`/buckets/${id}`).then(r => r.data);
export const reorderBuckets = (api, order)   => api.put('/buckets/reorder', { order }).then(r => r.data);

export const getBucketBreakdown = (api, params) => api.get('/buckets/breakdown', { params }).then(r => r.data);
export const getBucketTrend     = (api, id, params) => api.get(`/buckets/${id}/trend`, { params }).then(r => r.data);
export const getBucketExpenses  = (api, id, params) => api.get(`/buckets/${id}/expenses`, { params }).then(r => r.data);

// Replace an expense's bucket assignments.
export const setExpenseBuckets = (api, expenseId, bucketIds) =>
  api.put(`/expenses/${expenseId}/buckets`, { bucketIds }).then(r => r.data);
