/**
 * @fileoverview Vehicle API service.
 *
 * CRUD operations for the campus vehicle registry.
 */

import api from './client';

export const getVehicles = (params) => api.get('/vehicles', { params });
export const getVehicle = (vehicleNo) => api.get(`/vehicles/${vehicleNo}`);
export const createVehicle = (data) => api.post('/vehicles', data);
export const updateVehicle = (vehicleNo, data) => api.put(`/vehicles/${vehicleNo}`, data);
export const deleteVehicle = (vehicleNo) => api.delete(`/vehicles/${vehicleNo}`);
export const bulkImportVehicles = (file) => {
    const fd = new FormData();
    fd.append('file', file);
    // Content-Type must be undefined so Axios drops its default
    // 'application/json' and lets the browser set the correct
    // 'multipart/form-data; boundary=...' value automatically.
    return api.post('/vehicles/bulk', fd, { headers: { 'Content-Type': undefined } });
};
