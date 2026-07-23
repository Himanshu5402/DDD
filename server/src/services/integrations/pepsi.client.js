/**
 * PEPSI portal API client.
 *
 * Two modes, newest first:
 *
 * 1. **Integration-key mode** (preferred) — when `PEPSI_INTEGRATION_API_KEY`
 *    is set, all traffic goes to the PEPSI backend's machine endpoints
 *    (`{PEPSI_API_BASE}/integration/*`) with an `x-api-key` header. No login,
 *    no token cache. Error contract copied from hrms.client.js:
 *      - 503 ApiError when the key/base is not configured,
 *      - 502 ApiError on network failure or PEPSI 5xx,
 *      - client errors (400/401/404/409…) keep their status, message passed
 *        through from PEPSI's `{error}` envelope.
 *
 * 2. **Legacy login mode** (fallback, kept intact) — authenticates via
 *    `/auth/login` (or a pre-issued `PEPSI_API_TOKEN`) and fetches projects
 *    from `PEPSI_PROJECTS_PATH` with a Bearer token. Throws
 *    `PepsiEndpointsNotReadyError` on 404/501 so the sync orchestrator can
 *    fall back to the bundled snapshot.
 */
import env from '../../config/env.js';
import ApiError from '../../utils/ApiError.js';

export class PepsiEndpointsNotReadyError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PepsiEndpointsNotReadyError';
  }
}

let cachedToken = env.PEPSI_API_TOKEN || null;

/** True when the dedicated integration key is set (x-api-key mode). */
export function isPepsiKeyConfigured() {
  return Boolean(env.PEPSI_INTEGRATION_API_KEY);
}

/** True when enough config exists to attempt a live API call (either mode). */
export function isPepsiApiConfigured() {
  return Boolean(
    env.PEPSI_INTEGRATION_API_KEY ||
      env.PEPSI_API_TOKEN ||
      (env.PEPSI_API_EMAIL && env.PEPSI_API_PASSWORD)
  );
}

/* ==================== Integration-key mode (x-api-key) ==================== */

function pepsiUnreachable(err) {
  return new ApiError(502, 'PEPSI unreachable — try again', {
    code: 'PEPSI_UNREACHABLE',
    details: { cause: err?.message },
  });
}

async function keyedRequest(method, pathname, body) {
  if (!env.PEPSI_INTEGRATION_API_KEY) {
    throw new ApiError(503, 'PEPSI_INTEGRATION_API_KEY is not configured', {
      code: 'PEPSI_NOT_CONFIGURED',
    });
  }

  let res;
  try {
    res = await fetch(`${env.PEPSI_API_BASE}${pathname}`, {
      method,
      headers: {
        'x-api-key': env.PEPSI_INTEGRATION_API_KEY,
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw pepsiUnreachable(err);
  }

  const payload = await res.json().catch(() => null);

  if (!res.ok) {
    // PEPSI's error envelope is `{error}`; tolerate `{message}` too.
    const message =
      payload?.error || payload?.message || `PEPSI ${method} ${pathname} failed (HTTP ${res.status})`;
    // Client-level errors keep their status so the owner sees the real cause;
    // PEPSI server errors surface as a 502 upstream failure.
    const status = res.status >= 500 ? 502 : res.status;
    throw new ApiError(status, message, { code: 'PEPSI_ERROR', details: payload?.details });
  }

  return payload;
}

/** Write-through helpers for DDD → PEPSI owner operations. */
export const pepsiPost = (pathname, body) => keyedRequest('POST', pathname, body);
export const pepsiPut = (pathname, body) => keyedRequest('PUT', pathname, body);
export const pepsiDelete = (pathname) => keyedRequest('DELETE', pathname);

/**
 * Keyed GET for the read/sync path: a 404/501 means the PEPSI backend hasn't
 * deployed its /integration endpoints yet — surface that as the same
 * "not ready" state the legacy flow uses so snapshot fallback still works.
 */
async function keyedGet(pathname) {
  try {
    return await keyedRequest('GET', pathname);
  } catch (err) {
    if (err instanceof ApiError && (err.statusCode === 404 || err.statusCode === 501)) {
      throw new PepsiEndpointsNotReadyError(
        `PEPSI endpoint ${pathname} not available yet (HTTP ${err.statusCode}).`
      );
    }
    throw err;
  }
}

/**
 * Full bootstrap pull: `{projects, customers, leads, version}` from
 * `GET {PEPSI_API_BASE}/integration/bootstrap` (integration-key mode only).
 */
export async function fetchPepsiBootstrap() {
  const body = await keyedGet('/integration/bootstrap');
  const boot = body?.data ?? body ?? {};
  return {
    projects: Array.isArray(boot.projects) ? boot.projects : [],
    customers: Array.isArray(boot.customers) ? boot.customers : [],
    leads: Array.isArray(boot.leads) ? boot.leads : [],
    version: boot.version ?? null,
  };
}

/**
 * Reachability probe — PEPSI's health endpoint lives at `/api/health`, i.e.
 * directly under PEPSI_API_BASE. Never throws; returns true/false.
 */
export async function pingPepsi({ timeoutMs = 3000 } = {}) {
  if (!env.PEPSI_API_BASE) return false;
  try {
    const res = await fetch(`${env.PEPSI_API_BASE}/health`, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Accept: 'application/json' },
    });
    return res.ok;
  } catch {
    return false;
  }
}

/* ==================== Legacy login mode (fallback) ==================== */

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
 * wire shape. Integration-key mode hits `GET /integration/projects`; the
 * legacy flow (Bearer token) hits `PEPSI_PROJECTS_PATH`. Throws
 * PepsiEndpointsNotReadyError if the endpoint isn't live.
 */
export async function fetchPepsiProjects() {
  const body = isPepsiKeyConfigured()
    ? await keyedGet('/integration/projects')
    : await authedGet(env.PEPSI_PROJECTS_PATH);
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
