/**
 * @fileoverview Authentication API service.
 *
 * All auth-related HTTP calls: signup, signin, OTP verification, logout.
 */

import api from './client';

export const signIn = (data) => api.post('/auth/signin', data);
export const verifySigninOtp = (data) => api.post('/auth/signin/verify-otp', data);

export const signUp = (data) => api.post('/auth/signup', data);
export const verifySignupOtp = (data) => api.post('/auth/signup/verify-otp', data);

export const logout = () => api.post('/auth/logout');
