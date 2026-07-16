// Centralized access to Vite env vars (import.meta.env).
//
// In production the app is served by the API server itself (same origin),
// so the defaults are relative — no env vars needed on the host.
// In dev, Vite (:5173) talks to the API on :5000.
const prod = import.meta.env.PROD;

export const API_URL =
  import.meta.env.VITE_API_URL || (prod ? '/api/v1' : 'http://localhost:5000/api/v1');

export const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL || (prod ? window.location.origin : 'http://localhost:5000');

export const APP_NAME = 'ITSYBIZZ Command Center';
