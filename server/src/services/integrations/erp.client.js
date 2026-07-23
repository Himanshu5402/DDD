/**
 * itsybizz-ERP API client — DDD's outbound half of the two-way integration.
 *
 * Native-fetch wrapper (same house style as hrms.client.js) around the ERP
 * backend at `ERP_API_URL` (e.g. http://localhost:9078/api). Every request
 * carries the dedicated `x-api-key` header (ERP_INTEGRATION_API_KEY); the ERP
 * guards /integration/* with the same key.
 *
 * Error contract:
 *  - non-2xx      → ApiError with the ERP `message` passed through (ERP 5xx
 *                   surfaces as 502 — an upstream failure, not a DDD one).
 *  - network fail → 502 ApiError ('ERP unreachable — try again').
 *
 * NB the ERP does NOT wrap responses in {success, message, data} — callers
 * get the ERP-native body as-is ({count, items}, raw docs, {message} errors).
 */
import env from '../../config/env.js';
import ApiError from '../../utils/ApiError.js';

/** True when enough config exists to talk to the ERP. */
export function isErpConfigured() {
  return Boolean(env.ERP_API_URL && env.ERP_INTEGRATION_API_KEY);
}

function unreachable(err) {
  return new ApiError(502, 'ERP unreachable — try again', {
    code: 'ERP_UNREACHABLE',
    details: { cause: err?.message },
  });
}

async function request(method, pathname, body) {
  if (!env.ERP_API_URL) {
    throw new ApiError(503, 'ERP_API_URL is not configured', { code: 'ERP_NOT_CONFIGURED' });
  }

  let res;
  try {
    res = await fetch(`${env.ERP_API_URL}${pathname}`, {
      method,
      headers: {
        'x-api-key': env.ERP_INTEGRATION_API_KEY,
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw unreachable(err);
  }

  const payload = await res.json().catch(() => null);

  if (!res.ok) {
    const message = payload?.message || `ERP ${method} ${pathname} failed (HTTP ${res.status})`;
    // Client-level errors (400/401/404/409…) keep their status so the owner
    // sees the real cause (e.g. ERP delete guards); ERP 5xx surfaces as 502.
    const status = res.status >= 500 ? 502 : res.status;
    throw new ApiError(status, message, { code: 'ERP_ERROR', details: payload?.detail });
  }

  return payload;
}

export const get = (pathname) => request('GET', pathname);
export const post = (pathname, body) => request('POST', pathname, body);
export const put = (pathname, body) => request('PUT', pathname, body);
export const patch = (pathname, body) => request('PATCH', pathname, body);
export const del = (pathname) => request('DELETE', pathname);

/**
 * Reachability probe. The ERP health endpoint lives at /api/health and
 * ERP_API_URL already includes /api — so ping `{ERP_API_URL}/health`.
 * Never throws; returns true/false.
 */
export async function pingErp({ timeoutMs = 3000 } = {}) {
  if (!env.ERP_API_URL) return false;
  try {
    const res = await fetch(`${env.ERP_API_URL}/health`, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Accept: 'application/json' },
    });
    return res.ok;
  } catch {
    return false;
  }
}
