import api from './client';

export const getAlerts  = (params) => api.get('/alerts', { params });
export const resolveAlert = (id)   => api.patch(`/alerts/${id}/resolve`);
export const acknowledgeAlert = (id) => api.patch(`/alerts/${id}/acknowledge`);
