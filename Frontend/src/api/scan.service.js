/**
 * @fileoverview Scan / Logs API service.
 *
 * Vehicle scan submission and entry/exit log retrieval.
 */

import api from './client';

export const getLogs = (params) => api.get('/scan/logs', { params });
export const getActiveLogs = () => api.get('/scan/logs/active');
export const getVehicleLogs = (vehicleNo) => api.get(`/scan/logs/${vehicleNo}`);
export const scanPlate = (formData) => api.post('/scan', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
});
