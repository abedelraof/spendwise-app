export const getAdminStats   = (api)         => api.get('/admin/stats').then(r => r.data);
export const getAdminUsers   = (api, params) => api.get('/admin/users', { params }).then(r => r.data);
export const getAdminUser    = (api, id)     => api.get(`/admin/users/${id}`).then(r => r.data);
export const deleteAdminUser = (api, id)     => api.delete(`/admin/users/${id}`).then(r => r.data);
