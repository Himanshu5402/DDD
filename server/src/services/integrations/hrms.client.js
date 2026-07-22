/**
 * HRMS (RAMP) API client — DDD's outbound half of the two-way integration.
 *
 * Native-fetch wrapper (same house style as pepsi.client.js) around the HRMS
 * backend at `HRMS_API_URL` (e.g. http://localhost:5000/api/v1). Every request
 * carries the shared `x-api-key` header; the HRMS guards /integration/* with
 * the same key.
 *
 * Error contract:
 *  - non-2xx      → ApiError with the HRMS `message` passed through (HRMS 5xx
 *                   surfaces as 502 — an upstream failure, not a DDD one).
 *  - network fail → 502 ApiError ('HRMS unreachable — try again').
 *
 * Responses are the parsed HRMS envelope `{success, message, data}` — callers
 * unwrap `.data`.
 */
import env from '../../config/env.js';
import ApiError from '../../utils/ApiError.js';

/** True when enough config exists to talk to the HRMS. */
export function isHrmsConfigured() {
  return Boolean(env.HRMS_API_URL && env.INTEGRATION_API_KEY);
}

function unreachable(err) {
  return new ApiError(502, 'HRMS unreachable — try again', {
    code: 'HRMS_UNREACHABLE',
    details: { cause: err?.message },
  });
}

async function request(method, pathname, body) {
  if (!env.HRMS_API_URL) {
    throw new ApiError(503, 'HRMS_API_URL is not configured', { code: 'HRMS_NOT_CONFIGURED' });
  }

  let res;
  try {
    res = await fetch(`${env.HRMS_API_URL}${pathname}`, {
      method,
      headers: {
        'x-api-key': env.INTEGRATION_API_KEY,
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
    const message =
      payload?.message || `HRMS ${method} ${pathname} failed (HTTP ${res.status})`;
    // Client-level errors (400/401/404/409…) keep their status so the owner
    // sees the real cause; HRMS server errors surface as a 502 upstream failure.
    const status = res.status >= 500 ? 502 : res.status;
    throw new ApiError(status, message, { code: 'HRMS_ERROR', details: payload?.details });
  }

  return payload;
}

export const get = (pathname) => request('GET', pathname);
export const post = (pathname, body) => request('POST', pathname, body);
export const put = (pathname, body) => request('PUT', pathname, body);
export const patch = (pathname, body) => request('PATCH', pathname, body);
export const del = (pathname) => request('DELETE', pathname);

/**
 * Reachability probe. The HRMS health endpoint lives at the app root
 * (http://localhost:5000/health), NOT under /api/v1 — strip the API prefix.
 * Never throws; returns true/false.
 */
export async function pingHrms({ timeoutMs = 3000 } = {}) {
  if (!env.HRMS_API_URL) return false;
  const base = env.HRMS_API_URL.replace(/\/api\/v\d+\/?$/, '');
  try {
    const res = await fetch(`${base}/health`, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Accept: 'application/json' },
    });
    return res.ok;
  } catch {
    return false;
  }
}
