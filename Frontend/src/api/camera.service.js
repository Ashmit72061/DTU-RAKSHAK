/**
 * @fileoverview Camera API service.
 *
 * CRUD operations for campus CCTV cameras.
 */

import api from './client';

export const getCameras = () => api.get('/cameras');
export const createCamera = (data) => api.post('/cameras', data);
export const updateCamera = (id, data) => api.put(`/cameras/${id}`, data);
export const deleteCamera = (id) => api.delete(`/cameras/${id}`);
export const bulkImportCameras = (file) => {
    const fd = new FormData();
    fd.append('file', file);
    // Content-Type must be undefined so Axios drops its default
    // 'application/json' and lets the browser set the correct
    // 'multipart/form-data; boundary=...' value automatically.
    return api.post('/cameras/bulk', fd, { headers: { 'Content-Type': undefined } });
};
