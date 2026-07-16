/**
 * Wave-1 smoke test — all 7 business modules + cross-module links.
 * Runs against an ISOLATED in-memory MongoDB (never touches Atlas).
 *
 *   npm run smoke:wave1 -w server
 */
process.env.USE_MEMORY_DB = 'true';
process.env.MONGODB_URI = '';
process.env.NODE_ENV = 'development';
process.env.AI_PROVIDER = 'mock';

import http from 'node:http';

const { default: env } = await import('../config/env.js');
const { connectDatabase, disconnectDatabase } = await import('../config/database.js');
const { seedAll } = await import('../seed/seed.core.js');
const { createApp } = await import('../app.js');

const PORT = 5097;
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
  console.log(`\n🔬 Wave-1 smoke testing against ${API}\n`);

  try {
    const login = await req('POST', `${API}/auth/login`, {
      body: { email: env.SEED_ADMIN_EMAIL, password: env.SEED_ADMIN_PASSWORD },
    });
    const token = login.json?.data?.accessToken;
    const adminId = login.json?.data?.user?._id;
    check('admin login', Boolean(token));

    // ---------- Module 1: Goals ----------
    console.log('\n— Goals —');
    const goal = await req('POST', `${API}/goals`, {
      token,
      body: { title: 'Grow revenue', type: 'quarterly', target: { metric: 'Revenue', unit: 'INR', targetValue: 100 } },
    });
    const goalId = goal.json?.data?.goal?._id;
    check('create goal → 201', goal.status === 201, `(got ${goal.status})`);
    const goalList = await req('GET', `${API}/goals`, { token });
    check('list goals', goalList.status === 200 && goalList.json?.meta?.total >= 1);
    const ms = await req('POST', `${API}/goals/${goalId}/milestones`, { token, body: { title: 'First 50 lakh' } });
    check('add milestone', ms.status === 200 || ms.status === 201, `(got ${ms.status})`);
    const prog = await req('PATCH', `${API}/goals/${goalId}/progress`, { token, body: { currentValue: 50 } });
    check('progress from currentValue → 50%', prog.json?.data?.goal?.progress === 50, `(got ${prog.json?.data?.goal?.progress})`);
    const sugg = await req('POST', `${API}/goals/${goalId}/ai-suggestions`, { token });
    check('goal AI suggestions', sugg.status === 200 && typeof (sugg.json?.data?.suggestions) === 'string');

    // Cross-link: Task ↔ Goal
    const linkedTask = await req('POST', `${API}/tasks`, { token, body: { title: 'Close 3 enterprise deals', goal: goalId } });
    check('create task linked to goal', linkedTask.status === 201, `(got ${linkedTask.status})`);
    const tasksByGoal = await req('GET', `${API}/tasks?goal=${goalId}`, { token });
    check('GET /tasks?goal= returns linked task', tasksByGoal.json?.meta?.total >= 1, `(got ${tasksByGoal.json?.meta?.total})`);

    // ---------- Module 4: Products ----------
    console.log('\n— Products —');
    const product = await req('POST', `${API}/products`, { token, body: { name: 'KONTROLIX Edge', category: 'iot', sku: 'KTX-100' } });
    const productId = product.json?.data?.product?._id;
    check('create product → 201', product.status === 201, `(got ${product.status})`);
    const ver = await req('POST', `${API}/products/${productId}/versions`, { token, body: { version: '1.1.0', notes: 'OTA support' } });
    check('add version sets currentVersion', ver.json?.data?.product?.currentVersion === '1.1.0', `(got ${ver.json?.data?.product?.currentVersion})`);

    // ---------- Module 3: RRRMAS ----------
    console.log('\n— RRRMAS —');
    const contact = await req('POST', `${API}/rrrmas/contacts`, { token, body: { name: 'Acme Industries', type: 'customer', email: 'ops@acme.in' } });
    const contactId = contact.json?.data?.contact?._id || contact.json?.data?._id;
    check('create contact → 201', contact.status === 201, `(got ${contact.status})`);
    const project = await req('POST', `${API}/rrrmas/projects`, { token, body: { name: 'Acme SCADA rollout', customer: contactId, status: 'active' } });
    const projectId = project.json?.data?.project?._id || project.json?.data?._id;
    check('create project (→Contact) → 201', project.status === 201, `(got ${project.status})`);
    const renewal = await req('POST', `${API}/rrrmas/renewals`, {
      token,
      body: { title: 'KONTROLIX AMC 2027', customer: contactId, product: productId, amount: 250000, dueDate: new Date(Date.now() + 20 * 864e5).toISOString() },
    });
    check('create renewal (→Contact,→Product) → 201', renewal.status === 201, `(got ${renewal.status})`);
    const ticket = await req('POST', `${API}/rrrmas/tickets`, { token, body: { subject: 'Sensor offline', customer: contactId, priority: 'high' } });
    check('create support ticket → 201', ticket.status === 201, `(got ${ticket.status})`);
    const campaign = await req('POST', `${API}/rrrmas/campaigns`, { token, body: { name: 'Diwali automation promo', channel: 'email' } });
    check('create campaign → 201', campaign.status === 201, `(got ${campaign.status})`);
    // Cross-link: Task ↔ Project
    const projTask = await req('POST', `${API}/tasks`, { token, body: { title: 'Install edge gateways', project: projectId } });
    check('create task linked to project', projTask.status === 201, `(got ${projTask.status})`);

    // ---------- Module 5: Finance ----------
    console.log('\n— Finance —');
    const income = await req('POST', `${API}/finance/transactions`, {
      token,
      body: { type: 'income', amount: 5000, category: 'customer_payment', description: 'Acme milestone 1', linkedTo: { model: 'Project', id: projectId } },
    });
    check('create income (linkedTo Project) → 201', income.status === 201, `(got ${income.status})`);
    const expense = await req('POST', `${API}/finance/transactions`, { token, body: { type: 'expense', amount: 2000, category: 'software' } });
    check('create expense → 201', expense.status === 201, `(got ${expense.status})`);
    await req('POST', `${API}/finance/budgets`, { token, body: { name: 'Software budget', category: 'software', period: 'monthly', amount: 10000 } });
    const summary = await req('GET', `${API}/finance/summary`, { token });
    const totals = summary.json?.data?.totals;
    check('summary totals income=5000 expense=2000 net=3000', totals?.income === 5000 && totals?.expense === 2000 && totals?.net === 3000, `(got ${JSON.stringify(totals)})`);
    check('summary budgetUsage computed', Array.isArray(summary.json?.data?.budgetUsage) && summary.json.data.budgetUsage.length >= 1);
    const insights = await req('POST', `${API}/finance/ai-insights`, { token, body: {} });
    check('finance AI insights', insights.status === 200 && typeof insights.json?.data?.insights === 'string');

    // ---------- Module 6: Maintenance ----------
    console.log('\n— Maintenance —');
    const asset = await req('POST', `${API}/maintenance/assets`, {
      token,
      body: { name: 'CNC Machine A', code: 'CNC-01', product: productId, warrantyUntil: new Date(Date.now() + 15 * 864e5).toISOString() },
    });
    const assetId = asset.json?.data?.asset?._id || asset.json?.data?._id;
    check('create asset (→Product) → 201', asset.status === 201, `(got ${asset.status})`);
    const rec = await req('POST', `${API}/maintenance/records`, {
      token,
      body: { asset: assetId, type: 'preventive', scheduledFor: new Date(Date.now() + 7 * 864e5).toISOString() },
    });
    check('create maintenance record → 201', rec.status === 201, `(got ${rec.status})`);
    const upcoming = await req('GET', `${API}/maintenance/upcoming?days=30`, { token });
    check('upcoming: record + expiring warranty', (upcoming.json?.data?.records?.length >= 1) && (upcoming.json?.data?.expiringWarranties?.length >= 1),
      `(records=${upcoming.json?.data?.records?.length}, warr=${upcoming.json?.data?.expiringWarranties?.length})`);
    const brk = await req('POST', `${API}/maintenance/records`, { token, body: { asset: assetId, type: 'breakdown', scheduledFor: new Date().toISOString() } });
    check('breakdown record → 201', brk.status === 201, `(got ${brk.status})`);
    const assetAfter = await req('GET', `${API}/maintenance/assets/${assetId}`, { token });
    check('breakdown flips asset status', (assetAfter.json?.data?.asset?.status) === 'breakdown', `(got ${assetAfter.json?.data?.asset?.status})`);

    // ---------- Module 7: Employee Analytics ----------
    console.log('\n— Employee Analytics —');
    const empRec = await req('POST', `${API}/employee-analytics/records`, {
      token,
      body: { user: adminId, date: new Date().toISOString(), attendance: 'present', hoursWorked: 8, productivityScore: 85 },
    });
    check('create employee record → 201', empRec.status === 201, `(got ${empRec.status})`);
    const team = await req('GET', `${API}/employee-analytics/team`, { token });
    check('team analytics has rows', team.status === 200 && (team.json?.data?.length >= 1 || team.json?.data?.team?.length >= 1));
    const esummary = await req('GET', `${API}/employee-analytics/summary?user=${adminId}`, { token });
    check('per-user summary', esummary.status === 200);

    // ---------- Module 8: Evening Reporting ----------
    console.log('\n— Evening Reporting —');
    const rpt = await req('POST', `${API}/reports/submit`, {
      token,
      body: { workDone: 'Wired all 7 business modules', hoursWorked: 9, mood: 'great', blockers: '' },
    });
    const reportId = rpt.json?.data?.report?._id;
    check('submit daily report', rpt.status === 200 || rpt.status === 201, `(got ${rpt.status})`);
    const again = await req('POST', `${API}/reports/submit`, { token, body: { workDone: 'Wired all 7 modules + smoke tests', hoursWorked: 10 } });
    check('resubmit upserts (no duplicate error)', again.status === 200 || again.status === 201, `(got ${again.status})`);
    const mine = await req('GET', `${API}/reports/mine`, { token });
    check('my reports = 1 (upserted)', mine.json?.meta?.total === 1, `(got ${mine.json?.meta?.total})`);
    const teamRpts = await req('GET', `${API}/reports/team`, { token });
    check('team reports (admin has employee_analytics:read)', teamRpts.status === 200, `(got ${teamRpts.status})`);
    const rsum = await req('POST', `${API}/reports/${reportId}/ai-summary`, { token });
    check('report AI summary', rsum.status === 200 && typeof rsum.json?.data?.summary === 'string');
    const digest = await req('POST', `${API}/reports/digest`, { token, body: {} });
    check('team AI digest', digest.status === 200 && typeof digest.json?.data?.digest === 'string');

    // ---------- RBAC spot-checks ----------
    console.log('\n— RBAC —');
    const rolesRes = await req('GET', `${API}/roles`, { token });
    const employeeRole = rolesRes.json?.data?.find((r) => r.slug === 'employee');
    const empEmail = `emp_${Date.now()}@itsybizzz.local`;
    await req('POST', `${API}/users`, { token, body: { name: 'Emp W1', email: empEmail, password: 'Employee@123', roles: [employeeRole?._id] } });
    const empLogin = await req('POST', `${API}/auth/login`, { body: { email: empEmail, password: 'Employee@123' } });
    const empToken = empLogin.json?.data?.accessToken;
    const empFin = await req('POST', `${API}/finance/transactions`, { token: empToken, body: { type: 'expense', amount: 1, category: 'x' } });
    check('employee create transaction → 403', empFin.status === 403, `(got ${empFin.status})`);
    const empGoals = await req('GET', `${API}/goals`, { token: empToken });
    check('employee can read goals → 200', empGoals.status === 200, `(got ${empGoals.status})`);
    const empTeamRpts = await req('GET', `${API}/reports/team`, { token: empToken });
    check('employee team reports → 403', empTeamRpts.status === 403, `(got ${empTeamRpts.status})`);
    const empSubmit = await req('POST', `${API}/reports/submit`, { token: empToken, body: { workDone: 'My day' } });
    check('employee can submit own report', empSubmit.status === 200 || empSubmit.status === 201, `(got ${empSubmit.status})`);
  } finally {
    await new Promise((r) => server.close(r));
    await disconnectDatabase();
  }

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Wave-1 smoke crashed:', err);
  process.exit(1);
});
