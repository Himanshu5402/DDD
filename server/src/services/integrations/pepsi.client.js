/**
 * PEPSI portal API client.
 *
 * The portal at https://pepsi.itsybizz.com is backed by an API at
 * `PEPSI_API_BASE` (default https://pepsiapi.itsybizz.com/api) that, as of this
 * writing, exposes **authentication only** (`/auth/login`, `/auth/me`,
 * `/auth/refresh`) — project data still lives embedded in the portal frontend.
 *
 * This client is written "flip-ready": it authenticates and fetches projects
 * from `PEPSI_PROJECTS_PATH`. Until that endpoint exists it throws
 * `PepsiEndpointsNotReadyError`, and the sync orchestrator falls back to the
 * bundled snapshot. The day PEPSI ships `GET /projects`, set the PEPSI_API_*
 * env vars and live data flows through with no code change.
 */
import env from '../../config/env.js';

export class PepsiEndpointsNotReadyError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PepsiEndpointsNotReadyError';
  }
}

let cachedToken = env.PEPSI_API_TOKEN || null;

/** True when enough config exists to attempt a live API call. */
export function isPepsiApiConfigured() {
  return Boolean(env.PEPSI_API_TOKEN || (env.PEPSI_API_EMAIL && env.PEPSI_API_PASSWORD));
}

async function login() {
  if (env.PEPSI_API_TOKEN) return env.PEPSI_API_TOKEN;
  if (!env.PEPSI_API_EMAIL || !env.PEPSI_API_PASSWORD) {
    throw new Error(
      'PEPSI API credentials not configured — set PEPSI_API_EMAIL + PEPSI_API_PASSWORD (or PEPSI_API_TOKEN).'
    );
  }
  const res = await fetch(`${env.PEPSI_API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email: env.PEPSI_API_EMAIL, password: env.PEPSI_API_PASSWORD }),
  });
  if (!res.ok) throw new Error(`PEPSI login failed: HTTP ${res.status}`);
  const body = await res.json().catch(() => ({}));
  // Tolerate a few common envelope shapes for the access token.
  const token =
    body?.data?.accessToken || body?.accessToken || body?.data?.token || body?.token;
  if (!token) throw new Error('PEPSI login succeeded but no access token was returned.');
  cachedToken = token;
  return token;
}

async function authedGet(pathname, { retryOn401 = true } = {}) {
  const token = cachedToken || (await login());
  const res = await fetch(`${env.PEPSI_API_BASE}${pathname}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });

  if (res.status === 401 && retryOn401) {
    cachedToken = null; // token expired/invalid — re-login once
    return authedGet(pathname, { retryOn401: false });
  }
  // 404 / 501 mean the endpoint isn't implemented yet — a distinct, expected state.
  if (res.status === 404 || res.status === 501) {
    throw new PepsiEndpointsNotReadyError(
      `PEPSI endpoint ${pathname} not available yet (HTTP ${res.status}).`
    );
  }
  if (!res.ok) throw new Error(`PEPSI GET ${pathname} failed: HTTP ${res.status}`);
  return res.json();
}

/**
 * Fetch projects from the PEPSI API, normalized to a plain array in the sync
 * wire shape. Throws PepsiEndpointsNotReadyError if the endpoint isn't live.
 */
export async function fetchPepsiProjects() {
  const body = await authedGet(env.PEPSI_PROJECTS_PATH);
  const projects = Array.isArray(body)
    ? body
    : body?.data?.projects || body?.projects || body?.data || [];
  if (!Array.isArray(projects)) {
    throw new Error('PEPSI projects response was not an array.');
  }
  return projects;
}

/** Test-only: reset the cached token. */
export function _resetTokenCache() {
  cachedToken = env.PEPSI_API_TOKEN || null;
}
