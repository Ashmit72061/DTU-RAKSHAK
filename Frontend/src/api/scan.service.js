/**
 * @fileoverview Scan / Logs API service.
 *
 * Entry/exit log retrieval for the admin dashboard.
 * Scanning is handled exclusively by edge devices (cameras running YOLO + Flask)
 * which POST directly to /api/v1/scan using their X-Edge-Api-Key header.
 */

import api from './client';

export const getLogs = (params) => api.get('/scan/logs', { params });
export const getActiveLogs = () => api.get('/scan/logs/active');
export const getVehicleLogs = (vehicleNo) => api.get(`/scan/logs/${vehicleNo}`);
