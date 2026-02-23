/**
 * @fileoverview Public barrel export for the API layer.
 *
 * Import everything from here instead of reaching into individual files:
 *
 *   import { signIn, getVehicles, getCameras } from './api';
 *
 * To access the raw Axios instance (e.g. for one-off calls):
 *
 *   import api from './api';
 */

// ── Axios instance ─────────────────────────────────────────────
export { default } from './client';

// ── Service modules ────────────────────────────────────────────
export * from './auth.service';
export * from './vehicle.service';
export * from './camera.service';
export * from './scan.service';
