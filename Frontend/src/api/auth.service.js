/**
 * @fileoverview Authentication API service.
 *
 * All auth-related HTTP calls: signup, signin, OTP verification,
 * forgot password, resend OTP, update password, and logout.
 */

import api from './client';

export const signIn = (data) => api.post('/auth/signin', data);
export const verifySigninOtp = (data) => api.post('/auth/signin/verify-otp', data);

export const signUp = (data) => api.post('/auth/signup', data);
export const verifySignupOtp = (data) => api.post('/auth/signup/verify-otp', data);

export const forgotPassword = (data) => api.post('/auth/forgot-password', data);
export const verifyForgotPasswordOtp = (data) => api.post('/auth/forgot-password/verify-otp', data);

/** Resend OTP — type must be "SIGNUP" | "SIGNIN" | "FORGOT_PASSWORD" */
export const resendOtp = (data) => api.post('/auth/resend-otp', data);

/** Change password for the authenticated user */
export const updatePassword = (data) => api.post('/auth/update-password', data);

export const logout = () => api.post('/auth/logout');
