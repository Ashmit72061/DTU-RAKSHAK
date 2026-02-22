import axios from 'axios';

const API = axios.create({ baseURL: '/api/v1' });

// Attach JWT to every request
API.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-logout on 401
API.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.clear();
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default API;

// Auth
export const signIn = (data) => API.post('/auth/signin', data);
export const verifySigninOtp = (data) => API.post('/auth/signin/verify-otp', data);
export const signUp = (data) => API.post('/auth/signup', data);
export const verifySignupOtp = (data) => API.post('/auth/signup/verify-otp', data);
export const logout = () => API.post('/auth/logout');

// Vehicles
export const getVehicles = (params) => API.get('/vehicles', { params });
export const getVehicle = (vehicleNo) => API.get(`/vehicles/${vehicleNo}`);
export const createVehicle = (data) => API.post('/vehicles', data);
export const updateVehicle = (vehicleNo, data) => API.put(`/vehicles/${vehicleNo}`, data);
export const deleteVehicle = (vehicleNo) => API.delete(`/vehicles/${vehicleNo}`);

// Cameras
export const getCameras = () => API.get('/cameras');
export const createCamera = (data) => API.post('/cameras', data);
export const updateCamera = (id, data) => API.put(`/cameras/${id}`, data);
export const deleteCamera = (id) => API.delete(`/cameras/${id}`);

// Scan / Logs
export const getLogs = (params) => API.get('/scan/logs', { params });
export const getActiveLogs = () => API.get('/scan/logs/active');
export const getVehicleLogs = (vehicleNo) => API.get(`/scan/logs/${vehicleNo}`);
export const scanPlate = (formData) => API.post('/scan', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
