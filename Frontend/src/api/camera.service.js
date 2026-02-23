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
