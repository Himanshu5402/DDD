/**
 * End-to-end smoke test (no external services required — uses an ISOLATED
 * in-memory MongoDB, never the configured Atlas DB). Boots the real app and
 * exercises the auth + RBAC + AI flow over HTTP.
 *
 *   npm run smoke -w server
 */
// Force the in-memory DB BEFORE any module reads env (dotenv won't override
// vars already present in process.env).
process.env.USE_MEMORY_DB = 'true';
process.env.MONGODB_URI = '';
process.env.NODE_ENV = 'development';
process.env.AI_PROVIDER = 'mock';

import http from 'node:http';

const { default: env } = await import('../config/env.js');
const { connectDatabase, disconnectDatabase } = await import('../config/database.js');
const { seedAll } = await import('../seed/seed.core.js');
const { createApp } = await import('../app.js');

const PORT = 5099;
const BASE = `http://127.0.0.1:${PORT}`;
const API = `${BASE}${env.API_PREFIX}`;

let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ✅ ${name}`);
  } else {
    failed += 1;
    console.error(`  ❌ ${name} ${detail}`);
  }
}

async function req(method, url, { token, body } = {}) {
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* no body */
  }
  return { status: res.status, json };
}

async function main() {
  await connectDatabase();
  await seedAll();

  const app = createApp();
  const server = http.createServer(app);
  await new Promise((r) => server.listen(PORT, r));
  console.log(`\n🔬 Smoke testing against ${API}\n`);

  try {
    // 1. Health
    const health = await req('GET', `${API}/health`);
    check('GET /health → 200', health.status === 200, `(got ${health.status})`);
    check('health reports db connected', health.json?.data?.db?.connected === true);

    // 2. Unauthorized access is blocked
    const noAuth = await req('GET', `${API}/users`);
    check('GET /users without token → 401', noAuth.status === 401, `(got ${noAuth.status})`);

    // 3. Admin login
    const login = await req('POST', `${API}/auth/login`, {
      body: { email: env.SEED_ADMIN_EMAIL, password: env.SEED_ADMIN_PASSWORD },
    });
    check('POST /auth/login → 200', login.status === 200, `(got ${login.status})`);
    const accessToken = login.json?.data?.accessToken;
    const refreshToken = login.json?.data?.refreshToken;
    check('login returns accessToken', Boolean(accessToken));
    check('login returns refreshToken', Boolean(refreshToken));

    // 4. Bad password rejected
    const badLogin = await req('POST', `${API}/auth/login`, {
      body: { email: env.SEED_ADMIN_EMAIL, password: 'wrong-password' },
    });
    check('login with wrong password → 401', badLogin.status === 401, `(got ${badLogin.status})`);

    // 5. /me with token
    const me = await req('GET', `${API}/auth/me`, { token: accessToken });
    check('GET /auth/me → 200', me.status === 200, `(got ${me.status})`);
    check('admin is super admin', me.json?.data?.isSuperAdmin === true);
    check('admin has permissions', (me.json?.data?.permissions?.length || 0) > 0);

    // 6. RBAC-guarded list works for admin
    const users = await req('GET', `${API}/users`, { token: accessToken });
    check('GET /users (admin) → 200', users.status === 200, `(got ${users.status})`);
    check('users list is paginated', Array.isArray(users.json?.data) && users.json?.meta?.total >= 1);

    // 7. Roles + permission catalog
    const roles = await req('GET', `${API}/roles`, { token: accessToken });
    check('GET /roles → 200', roles.status === 200, `(got ${roles.status})`);
    check('4 system roles seeded', (roles.json?.meta?.total || 0) >= 4, `(got ${roles.json?.meta?.total})`);

    const catalog = await req('GET', `${API}/roles/permissions/catalog`, { token: accessToken });
    check('GET permission catalog → 200', catalog.status === 200);
    check('catalog has modules', Object.keys(catalog.json?.data?.permissions || {}).length > 0);

    // 8. Create a limited employee and verify RBAC denies /users
    const empEmail = `emp_${Date.now()}@itsybizzz.local`;
    const empPass = 'Employee@123';
    const rolesList = roles.json?.data || [];
    const employeeRole = rolesList.find((r) => r.slug === 'employee');
    const created = await req('POST', `${API}/users`, {
      token: accessToken,
      body: { name: 'Test Employee', email: empEmail, password: empPass, roles: [employeeRole?._id] },
    });
    check('POST /users (create employee) → 201', created.status === 201, `(got ${created.status})`);

    const empLogin = await req('POST', `${API}/auth/login`, { body: { email: empEmail, password: empPass } });
    const empToken = empLogin.json?.data?.accessToken;
    check('employee can log in', Boolean(empToken));

    const empUsers = await req('GET', `${API}/users`, { token: empToken });
    check('employee GET /users → 403 (RBAC)', empUsers.status === 403, `(got ${empUsers.status})`);

    const empAi = await req('POST', `${API}/ai/ask`, { token: empToken, body: { prompt: 'Summarize my day' } });
    check('employee POST /ai/ask → 200 (has ai:read)', empAi.status === 200, `(got ${empAi.status})`);
    check('AI returns text', typeof empAi.json?.data?.text === 'string' && empAi.json.data.text.length > 0);

    // 9. Refresh rotation
    const refreshed = await req('POST', `${API}/auth/refresh`, { body: { refreshToken } });
    check('POST /auth/refresh → 200', refreshed.status === 200, `(got ${refreshed.status})`);
    check('refresh issues a new access token', Boolean(refreshed.json?.data?.accessToken));

    // 10. Old refresh token is now revoked (rotation / reuse detection)
    const reused = await req('POST', `${API}/auth/refresh`, { body: { refreshToken } });
    check('reusing old refresh token → 401', reused.status === 401, `(got ${reused.status})`);
  } finally {
    await new Promise((r) => server.close(r));
    await disconnectDatabase();
  }

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Smoke test crashed:', err);
  process.exit(1);
});
