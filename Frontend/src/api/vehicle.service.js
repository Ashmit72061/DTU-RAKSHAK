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
