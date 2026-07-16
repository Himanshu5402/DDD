import env, { isProd } from './env.js';

// Any localhost / 127.0.0.1 origin on any port (dev convenience — Vite may
// pick 5173, 5174, … depending on what's free).
const LOCALHOST_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/** Explicit allowlist from CLIENT_URL (supports a comma-separated list). */
function allowlist() {
  return env.CLIENT_URL.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isAllowedOrigin(origin) {
  // Non-browser clients (curl, server-to-server, same-origin) send no Origin.
  if (!origin) return true;
  if (allowlist().includes(origin)) return true;
  // In development, accept any localhost port so the client's exact port
  // doesn't have to be pinned.
  if (!isProd && LOCALHOST_RE.test(origin)) return true;
  return false;
}

/** cors() / socket.io-compatible origin callback. */
export function corsOrigin(origin, callback) {
  callback(null, isAllowedOrigin(origin));
}
