// src/api.js
// Centralized axios instance for the whole app + helpers for absolute URLs
import axios from 'axios';

const envBase = process.env.REACT_APP_API_BASE_URL;
// If REACT_APP_API_BASE_URL is set, we use it as the absolute base (e.g. http://localhost:5000).
// Otherwise we default to same-origin ("") and call endpoints with /api/...
const baseURL = envBase && envBase.trim() !== '' ? envBase : '';

const api = axios.create({
  baseURL,
  withCredentials: true, // express-session cookies
});

/**
 * Returns the API origin we should target for absolute links (uploads, etc).
 * - If REACT_APP_API_BASE_URL is set -> use that (no trailing slash).
 * - Else -> use current window origin (same-origin packaged server).
 */
export function getApiOrigin() {
  const fromEnv = envBase && envBase.trim() !== '' ? envBase.trim() : '';
  const origin = fromEnv || (typeof window !== 'undefined' ? window.location.origin : '');
  return origin.replace(/\/+$/, '');
}

/**
 * Turn a relative path into an absolute URL against the API origin.
 * If the input already looks absolute (http/https), it is returned unchanged.
 * Examples:
 *   toAbsoluteUrl('/uploads/receipts/file.pdf')
 *   toAbsoluteUrl('uploads/receipts/file.pdf')
 */
export function toAbsoluteUrl(path) {
  if (!path) return path;
  if (/^https?:\/\//i.test(path)) return path;
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${getApiOrigin()}${p}`;
}

export default api;
