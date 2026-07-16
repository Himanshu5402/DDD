/**
 * Tasks module smoke test — runs against an ISOLATED in-memory MongoDB
 * (never touches the configured Atlas DB), regardless of server/.env.
 *
 *   npm run smoke:tasks -w server
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

const PORT = 5098;
const API = `http://127.0.0.1:${PORT}${env.API_PREFIX}`;

let passed = 0;
let failed = 0;
const check = (name, cond, detail = '') => {
  if (cond) { passed += 1; console.log(`  ✅ ${name}`); }
  else { failed += 1; console.error(`  ❌ ${name} ${detail}`); }
};

async function req(method, url, { token, body } = {}) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, json };
}

async function main() {
  await connectDatabase();
  await seedAll();
  const server = http.createServer(createApp());
  await new Promise((r) => server.listen(PORT, r));
  console.log(`\n🔬 Tasks smoke testing against ${API}\n`);

  try {
    const login = await req('POST', `${API}/auth/login`, {
      body: { email: env.SEED_ADMIN_EMAIL, password: env.SEED_ADMIN_PASSWORD },
    });
    const token = login.json?.data?.accessToken;
    check('admin login', Boolean(token));

    // Create
    const created = await req('POST', `${API}/tasks`, {
      token,
      body: { title: 'Ship the tasks module', priority: 'high', tags: ['module-2'] },
    });
    check('POST /tasks → 201', created.status === 201, `(got ${created.status})`);
    const taskId = created.json?.data?.task?._id;
    check('task defaults to todo', created.json?.data?.task?.status === 'todo');

    // Board
    const board = await req('GET', `${API}/tasks/board`, { token });
    check('GET /tasks/board → 200', board.status === 200, `(got ${board.status})`);
    const todoCol = board.json?.data?.columns?.find((c) => c.status === 'todo');
    check('board has 5 columns', board.json?.data?.columns?.length === 5);
    check('new task appears in todo column', todoCol?.tasks?.some((t) => t._id === taskId));

    // List
    const list = await req('GET', `${API}/tasks`, { token });
    check('GET /tasks paginated', Array.isArray(list.json?.data) && list.json?.meta?.total >= 1);

    // Subtask
    const sub = await req('POST', `${API}/tasks`, { token, body: { title: 'Write smoke test', parent: taskId } });
    check('create subtask → 201', sub.status === 201, `(got ${sub.status})`);
    const detail = await req('GET', `${API}/tasks/${taskId}`, { token });
    check('GET /tasks/:id returns subtasks', detail.json?.data?.subtasks?.length === 1);

    // Comment
    const comment = await req('POST', `${API}/tasks/${taskId}/comments`, { token, body: { body: 'Looking good!' } });
    check('add comment → 201', comment.status === 201, `(got ${comment.status})`);

    // Checklist add + toggle
    const cl = await req('POST', `${API}/tasks/${taskId}/checklist`, { token, body: { text: 'Add tests' } });
    check('add checklist item', cl.json?.data?.checklist?.length === 1);
    const itemId = cl.json?.data?.checklist?.[0]?._id;
    const toggled = await req('PATCH', `${API}/tasks/${taskId}/checklist/${itemId}`, { token });
    check('toggle checklist item done', toggled.json?.data?.checklist?.[0]?.done === true);

    // Time log
    const time = await req('POST', `${API}/tasks/${taskId}/time`, { token, body: { minutes: 45, note: 'setup' } });
    check('log time → totals 45m', time.json?.data?.timeSpentMinutes === 45, `(got ${time.json?.data?.timeSpentMinutes})`);

    // Move to done
    const moved = await req('PATCH', `${API}/tasks/${taskId}/move`, { token, body: { status: 'done' } });
    check('move to done → 200', moved.status === 200, `(got ${moved.status})`);
    check('completedAt set on done', Boolean(moved.json?.data?.task?.completedAt));

    // Recurrence: completing a daily-recurring task spawns the next one
    const recurring = await req('POST', `${API}/tasks`, {
      token,
      body: { title: 'Daily standup', dueDate: new Date().toISOString(), recurrence: { frequency: 'daily', interval: 1 } },
    });
    const recId = recurring.json?.data?.task?._id;
    const recMoved = await req('PATCH', `${API}/tasks/${recId}/move`, { token, body: { status: 'done' } });
    check('recurring task spawns next occurrence', Boolean(recMoved.json?.data?.spawned?._id));

    // AI summary
    const summary = await req('POST', `${API}/tasks/${taskId}/ai-summary`, { token });
    check('AI summary → 200 with text', summary.status === 200 && typeof summary.json?.data?.summary === 'string' && summary.json.data.summary.length > 0);

    // RBAC: employee can read board but not create
    const rolesRes = await req('GET', `${API}/roles`, { token });
    const employeeRole = rolesRes.json?.data?.find((r) => r.slug === 'employee');
    const empEmail = `emp_${Date.now()}@itsybizzz.local`;
    await req('POST', `${API}/users`, { token, body: { name: 'Emp', email: empEmail, password: 'Employee@123', roles: [employeeRole?._id] } });
    const empLogin = await req('POST', `${API}/auth/login`, { body: { email: empEmail, password: 'Employee@123' } });
    const empToken = empLogin.json?.data?.accessToken;
    const empBoard = await req('GET', `${API}/tasks/board`, { token: empToken });
    check('employee can read board (tasks:read)', empBoard.status === 200, `(got ${empBoard.status})`);
    const empCreate = await req('POST', `${API}/tasks`, { token: empToken, body: { title: 'nope' } });
    check('employee cannot create task → 403', empCreate.status === 403, `(got ${empCreate.status})`);
  } finally {
    await new Promise((r) => server.close(r));
    await disconnectDatabase();
  }

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Tasks smoke crashed:', err);
  process.exit(1);
});
