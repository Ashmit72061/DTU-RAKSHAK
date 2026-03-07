/**
 * @fileoverview HTTP client configuration.
 *
 * Creates and exports a pre-configured Axios instance used by all
 * service modules. Interceptors handle JWT attachment and silent
 * token refresh with rotation.
 *
 * Usage:  import api from './api/client';
 */

import axios from 'axios';
import { attachAuthInterceptors } from './interceptors';

// ── Constants ──────────────────────────────────────────────────
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';
const TOKEN_KEY = 'accessToken';
const REFRESH_URL = '/auth/refresh-token';
const LOGIN_PATH = '/login';

// ── Axios Instance ─────────────────────────────────────────────
const api = axios.create({
    baseURL: BASE_URL,
    withCredentials: true,        // send httpOnly cookies on every request
    timeout: 15_000,      // 15 s network timeout
    headers: {
        'Content-Type': 'application/json',
    },
});

// ── Interceptors ───────────────────────────────────────────────
attachAuthInterceptors(api, { TOKEN_KEY, REFRESH_URL, LOGIN_PATH });

export default api;
