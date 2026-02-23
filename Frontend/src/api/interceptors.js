/**
 * @fileoverview Axios interceptors for authentication.
 *
 * - Request interceptor:  Attaches the JWT access token.
 * - Response interceptor: On 401, silently refreshes the access token
 *   using the httpOnly refresh-token cookie, then retries the original
 *   request. Concurrent 401s are queued so only one refresh call is made.
 *   Logs out only when the refresh itself fails (expired / revoked).
 */

// ── Private state (module-scoped, not leaked) ──────────────────
let isRefreshing = false;
let failedQueue = [];

/**
 * Flush the queue of requests that were waiting for a token refresh.
 * @param {Error|null} error  – non-null means the refresh failed
 * @param {string|null} token – the new access token (if refresh succeeded)
 */
function processQueue(error, token = null) {
    failedQueue.forEach(({ resolve, reject }) =>
        error ? reject(error) : resolve(token),
    );
    failedQueue = [];
}

/**
 * Force-logout: clear local storage and redirect to login.
 * @param {string} loginPath – path to redirect to
 */
function forceLogout(loginPath) {
    localStorage.clear();
    window.location.href = loginPath;
}

/**
 * Register auth interceptors on the given Axios instance.
 *
 * @param {import('axios').AxiosInstance} instance
 * @param {Object}  opts
 * @param {string}  opts.TOKEN_KEY   – localStorage key for the access token
 * @param {string}  opts.REFRESH_URL – relative URL of the refresh endpoint
 * @param {string}  opts.LOGIN_PATH  – frontend route to redirect on hard-logout
 */
export function attachAuthInterceptors(instance, { TOKEN_KEY, REFRESH_URL, LOGIN_PATH }) {

    // ── Request: attach Bearer token ───────────────────────────
    instance.interceptors.request.use((config) => {
        const token = localStorage.getItem(TOKEN_KEY);
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    });

    // ── Response: silent refresh on 401 ────────────────────────
    instance.interceptors.response.use(
        (response) => response,
        async (error) => {
            const originalRequest = error.config;
            const status = error.response?.status;

            // Guard: only handle 401, and never re-handle a retry or the refresh call itself
            const isUnauthorized = status === 401;
            const isRefreshCall = originalRequest.url === REFRESH_URL;
            const isAlreadyRetried = originalRequest._retry;

            if (!isUnauthorized || isAlreadyRetried || isRefreshCall) {
                if (isUnauthorized && isRefreshCall) forceLogout(LOGIN_PATH);
                return Promise.reject(error);
            }

            // If a refresh is already in-flight, queue this request
            if (isRefreshing) {
                return new Promise((resolve, reject) => {
                    failedQueue.push({ resolve, reject });
                }).then((newToken) => {
                    originalRequest.headers.Authorization = `Bearer ${newToken}`;
                    return instance(originalRequest);
                });
            }

            // First 401 — kick off the refresh
            originalRequest._retry = true;
            isRefreshing = true;

            try {
                const { data } = await instance.post(REFRESH_URL);
                const newAccessToken = data.data.accessToken;

                localStorage.setItem(TOKEN_KEY, newAccessToken);
                instance.defaults.headers.common.Authorization = `Bearer ${newAccessToken}`;
                originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;

                processQueue(null, newAccessToken);
                return instance(originalRequest);

            } catch (refreshError) {
                processQueue(refreshError, null);
                forceLogout(LOGIN_PATH);
                return Promise.reject(refreshError);

            } finally {
                isRefreshing = false;
            }
        },
    );
}
