# ITSYBIZZ Command Center — Engineering Audit Report

**Repo:** `D:/Himanshu_itsybizzz/DDD` · **Date:** 2026-07-17 · **Auditors:** 16-person engineering team (4 FE, 6 BE, 3 DevOps, 3 QA) · All Critical/High findings independently verified against the code.

---

## 1. Executive Summary

The Command Center is architecturally healthier than most MERN codebases at this stage: a disciplined Express API (auth → RBAC → Zod validation → audit on every route), a coherent lazy-loaded React/MUI client whose permission model exactly mirrors the server's, hashed-and-rotated refresh sessions, and a clean single-service Render deployment. The team that built it clearly had a plan and mostly followed it. However, the product is **not safe to put real users or data on today**. Three verified security defects would each be exploitable on day one: any user with `users:update` can grant themselves super-admin; the production login page prints a working super-admin email/password pair; and password resets do not kill existing sessions, so a compromised account survives its own remediation. Operationally, there is zero CI — unreviewed commits (`"abc"`, `"made some changes"`) auto-deploy to production, the health check reports HTTP 200 with the database down, and no indexes are ever built on a fresh production DB. Test coverage is roughly 30% of the server surface (happy-path only) and 0% of the client. The fixes are almost all small and localized — this is a hardening problem, not a rewrite problem. One focused sprint closes the security holes; a second closes the operational ones.

## 2. Architecture Overview

**Client** (`client/`): Vite + React + MUI. `main.jsx` composes QueryClient → Theme → Router → AuthProvider; `App.jsx` defines a fully `React.lazy` route tree behind `ProtectedRoute` + `AppLayout`, with per-route permission guards. State is server-driven via React Query (30s staleTime, invalidate-on-mutation); a single axios instance (`client/src/lib/axios.js`) injects the Bearer token and runs a single-flight 401→refresh→retry interceptor that broadcasts a session-expired event on terminal failure. `AuthContext` owns the loading/authenticated/unauthenticated state machine and the Socket.IO lifecycle. Client `hasPermission` (`AuthContext.jsx:80-86`) is byte-for-byte equivalent to the server's `authorize.middleware.js:17` (`module:action` || `module:manage` || super-admin).

**Server** (`server/`): Express with a sane middleware spine (`app.js`: helmet → CORS → body limits → cookie → compression → mongo-sanitize → hpp → requestId → morgan → rate-limited `/api/v1` router → SPA fallback → error handler). 18 route groups / ~129 endpoints, every one behind `authenticate` + per-action `authorize` + Zod `validate` + audit middleware. Env config is Zod-validated fail-fast with a production refusal of default JWT secrets. Auth uses bcrypt passwords, separate access/refresh secrets with token-type claims, and a `Session` collection storing only SHA-256 token hashes with rotation lineage and TTL cleanup.

**Data**: 21 Mongoose models plus a dynamic custom-fields engine (`server/src/modules/customFields`) that validates admin-defined fields across 8 entity types. Indexes generally match real access patterns; deletion is almost entirely hard-delete with no cascade.

**Realtime**: Socket.IO with JWT-verified handshakes; controllers broadcast `tasks:changed`/`goals:changed`/etc. globally, and every live page invalidates the matching React Query keys.

**Providers**: pluggable AI (mock/Claude/OpenAI factory, lazy SDK loading), pluggable storage (local/Cloudinary), a mail service (currently uncalled), and a PEPSI project-sync integration.

**Deploy**: single Render web service (`render.yaml`) — root `npm run build` does `npm ci` in both packages and vite-builds the client; Express serves `client/dist` with an SPA fallback, and the client defaults to same-origin API/socket URLs so production needs no `VITE_` vars. `docker-compose.yml` supplies Mongo/Redis for self-hosting. Redis is optional-and-unused; BullMQ is declared but has zero queue code.

## 3. What's Good

- **RBAC is real and consistent.** Every route file mounts `authenticate` + `authorize(module, action)`; the audit found no unguarded route except an intentionally-open, commented one. Client gating mirrors server semantics exactly, from the same module catalog (`server/src/config/constants.js`).
- **Auth fundamentals are above average**: hashed refresh tokens with single-use rotation and reuse rejection, separate JWT secrets with type claims, generic login errors, a stricter auth rate limiter, and a prod boot refusal of default JWT secrets (`env.js:80-87`).
- **Input handling is disciplined**: every write endpoint has a Zod schema; `validate` middleware replaces `req.body` with the parsed object; services use explicit `UPDATABLE` allowlists (mass assignment blocked); all search input is regex-escaped; pagination clamps hostile values.
- **No secrets in git** — verified via full-history grep. `render.yaml` uses `generateValue`/`sync:false` correctly; `.gitignore` blocks env files.
- **Good patterns worth reusing**: the `rrrmas.routes.js` `buildResource` factory (5 CRUD routers from one definition), RrrmasPage's config-driven generic CRUD UI, tickets deriving `sla.breached` at read time, the Jira-style `participantGuard`, permission-aware parallel dashboard aggregation, and idempotent upsert-based seeds.
- **The smoke harness is a hidden asset**: three scripts boot the real app over HTTP against in-memory MongoDB with the mock AI provider, assert computed business values (not just status codes), and pass 82/82 in ~10s warm. This is a ready-made foundation for a real test suite and E2E.
- **Error handling and correlation**: one error envelope covering ApiError/Zod/Mongoose/JWT, stacks hidden in prod, `X-Request-Id` threaded through logs, responses, and audit records.

Checked and OK: no refuted claims — every critical/high report survived independent verification.

## 4. Confirmed Issues

### Critical

**C1. Vertical privilege escalation: any `users:update` holder can grant super_admin**
`server/src/modules/users/users.service.js:79` (updateUser) and `:94` (assignRoles) copy `data.roles` onto the user with no role-hierarchy check, no self-modification guard, and no `isSuperAdmin` comparison — routes require only `authorize(USERS, UPDATE)`. A non-super Administrator (or any custom role with `users:update`) can PATCH their own roles to `[super_admin]` and seize full control. **Fix:** forbid assigning roles carrying `isSuperAdmin` (or higher level) unless the actor is super admin, and block self-role modification, in both `updateUser` and `assignRoles`.

**C2. Working super-admin credentials disclosed by default**
Three verified links in one chain: (a) `client/src/pages/LoginPage.jsx:140` unconditionally renders `Dev seed admin: admin@itsybizzz.local / Admin@12345` — ships in the production bundle; (b) `server/src/config/env.js:35-36` defaults `SEED_ADMIN_PASSWORD` to exactly that value and the prod guard at `env.js:80-87` covers only JWT secrets; (c) `render.yaml` marks the password `sync:false` and pins the same email, and README documents the pair. If an operator seeds production without setting the password, the public login screen advertises a working super-admin login. **Fix:** gate the Alert behind `import.meta.env.DEV`; extend the `env.js` prod guard to refuse the default seed password; make `seed.js` require explicit credentials outside dev; rotate the Render deployment's admin password; remove the password from README.

**C3. Password reset does not invalidate sessions or tokens**
`server/src/modules/users/users.service.js:103` (adminResetPassword) sets a new hash but never revokes the user's `Session` documents, and `authenticate.middleware.js:27` never compares token `iat` to a `passwordChangedAt`. After resetting a compromised account, the attacker's access tokens stay valid to expiry and their refresh sessions keep rotating **indefinitely**. **Fix:** revoke all Sessions and bump `passwordChangedAt` on any password change; reject access tokens whose `iat` predates it.

### High

**H1. Socket.IO realtime silently dies after 15 minutes** — `client/src/lib/socket.js:13` captures the access token in a static `auth` object; the server verifies the JWT on every reconnect handshake (`server/src/socket/index.js:18-28`). After token expiry, any disconnect (deploy, network blip, sleep) fails with `connect_error`, which permanently stops auto-reconnect; no handler exists, and `getSocket()` returns the dead socket so it's never rebuilt. All live updates stop for the session. **Fix:** callback-form auth `auth: (cb) => cb({ token: tokenStore.getAccess() })`, a `connect_error` handler that refreshes-then-reconnects, and re-auth on tokenStore rotation.

**H2. Contact deletion orphans projects, renewals, tickets, and transactions** — `server/src/modules/rrrmas/contacts.service.js:73` does a bare `deleteOne()` although `Project.customer`, `Renewal.customer`, `SupportTicket.customer`, and `Transaction.party.contact` all reference Contact. Siblings already guard this exact bug (`companies.routes.js:75-78`, `assets.service.js:114-119`). Broader: `deleteUser` (`users.service.js:127`) strands refs across Tasks/Goals/Tickets/HR records and never revokes the user's Sessions. **Fix:** block delete while referenced (or null refs in a grouped cleanup); pick one deletion strategy repo-wide (User already has `isActive` soft-delete).

**H3. budgetUsage math is wrong by design** — `server/src/modules/finance/transactions.service.js:177-189` divides spend over the whole query range (default 12 months) by a **per-period** budget amount (`b.period` is fetched, never used). A 50k monthly budget with 40k/month spend reports 960% used — and the wrong number is fed verbatim into the AI insights prompt (:218-220). **Fix:** compute spend within the budget's current period window (respecting start/end dates) before dividing.

**H4. Finance accepts `Infinity` as an amount** — `server/src/modules/finance/finance.validation.js:36` uses `z.coerce.number().min(0.01)` with no `.finite()`/max; verified against installed zod 3.25.76 that `'Infinity'` and `'1e308'` both parse. One such transaction makes every `/finance/summary` aggregate `Infinity`. **Fix:** add `.finite().max(...)`; longer term, integer minor units or Decimal128, grouped by currency.

**H5. No CI/CD — untested commits auto-deploy to production** — no `.github/` exists; `render.yaml` auto-deploys `main`; history shows direct pushes (`"abc"`). CI-safe checks already exist (smoke suites on in-memory Mongo, lint, deterministic build) but nothing runs them. **Fix:** minimal GitHub Actions workflow (ci in both packages, lint, smoke suites, vite build) + Render "wait for CI".

**H6. docker-compose labeled "Production/staging infra" ships root creds and open Redis** — `docker-compose.yml:8-20` publishes Mongo on 0.0.0.0:27017 with hardcoded `itsybizzz/itsybizzz` and unauthenticated Redis on 0.0.0.0:6379. On an internet-facing host this is datastore takeover. **Fix:** bind to 127.0.0.1, env-sourced credentials, `requirepass`, relabel as dev-only.

### Confirmed Medium (verified, ship-blocking for specific features)

| # | File | Issue & fix |
|---|------|-------------|
| M1 | `server/src/routes/index.js:37` | Health probe always returns HTTP 200 via `ApiResponse.ok()` even with Mongo disconnected — Render keys on status code, so dead instances pass health checks. Return 503 when `readyState !== 1`; split live/ready; mount before the rate limiter. |
| M2 | `server/src/config/database.js:40` | `autoIndex: !isProd` but **no** `syncIndexes()` call or script exists anywhere — a fresh prod DB gets zero unique indexes (duplicate emails possible, all queries unindexed). Add an explicit index-build step at deploy/seed. |
| M3 | `server/src/config/logger.js:19` | Morgan writes at winston level `http`, prod logger is hardcoded `info` — production access logs are silently discarded (Render stdout is the only observability surface). Add `LOG_LEVEL` env; include `req.id` in the morgan format. |
| M4 | `server/src/modules/users/users.service.js:79` | `updateUser` writes `customFields` raw (Mixed, `z.record(z.any())`), bypassing `validateValues` that every other module uses, and replaces instead of merging the blob. Route through `validateValues('user', merged, {partial:true})`. |
| M5 | `server/src/modules/reporting/reporting.service.js:46` | Reviewed daily reports can be silently rewritten by re-submitting (review stamp kept), and any past/future `date` is accepted. Reset status on edit; bound backfill window. |
| M6 | `server/src/models/auditLog.model.js:25` | AuditLog writes on every mutating request with 4 indexes and no TTL/retention — will become the largest collection. Add a TTL index or archival job. |
| M7 | `client/src/components/tasks/TaskDialog.jsx:121` | Edits cannot clear dueDate/startDate/estimate (empty fields omitted from PATCH). Mirror GoalDialog's explicit-null pattern (`GoalsPage.jsx:305-308`). |
| M8 | `client/src/pages/tasks/TasksBoardPage.jsx:81` | Board move mutation has no `onError` and no optimistic update — failed drags (403/validation/network) do nothing, silently. Add a global MutationCache onError toast + `onMutate/onSettled`. |
| M9 | `server/src/routes/index.js` + `client/package.json` | ~65% of 129 endpoints untested (audit, companies, custom-fields, dashboard, insights, pepsi completely; nearly all PATCH/DELETE); client has **zero** tests; `server npm test` invokes an uninstalled jest (`server/package.json:17`). See §7. |
| M10 | `render.yaml:30` | `STORAGE_PROVIDER=local` on Render's ephemeral free-plan filesystem — every deploy/restart wipes all uploads. Switch to the already-implemented Cloudinary provider before shipping any upload feature. |

## 5. Notable Medium/Low Issues (reported, worth fixing)

**Session & auth hardening (BE):**
- Refresh token duplicated into localStorage and JSON bodies despite an httpOnly cookie already existing (`client/src/lib/tokenStore.js`, `auth.controller.js:52-78`) — XSS yields a 7-day credential. Move to cookie-only refresh, access token in memory.
- Refresh cookie is `SameSite=None` in prod (app is same-origin) with no CSRF middleware, on unauthenticated `/auth/refresh` and `/auth/logout` (`auth.controller.js:14-20`). Use `lax`/`strict`, add authLimiter to both.
- Refresh-token reuse rejects one request but never revokes the session family (`auth.service.js:82-87`) — rotation without theft detection.
- `mustChangePassword` is set but never enforced, and no change-password route is wired (`auth.validation.js` schema is dead code). Registration leaks account existence (409).
- CSP fully disabled (`app.js:35`) while `/uploads` is served same-origin; Swagger UI + raw spec public in prod outside the rate limiter (`app.js:57`, `swagger.js:44-51`).
- Cross-tab refresh race: two tabs replaying the same single-use token log the user out everywhere (`client/src/lib/axios.js:54-57`); add a storage-event listener / re-read-before-clear.

**Data integrity & domain correctness (BE):**
- Renewal statuses never transition (`renewals.service.js`) — overdue renewals silently vanish from the dashboard filter (`dashboard.service.js:99-114`). Derive from `dueDate` at read time like tickets do.
- PEPSI-synced projects documented read-only but PATCH/DELETE not blocked (`projects.service.js:63-83`); pepsi upsert matches `externalId` without `source` scoping.
- Money as floats, summed across mixed currencies, hard-labeled INR (`transaction.model.js:30`, `transactions.service.js:129-139`).
- Day-boundary math uses server-local TZ with no `TZ` config — IST users submitting after midnight overwrite yesterday's report via the unique `{user,date}` upsert (`reporting.service.js`). Add a business-timezone env var.
- Recurrence spawns duplicates on done→todo→done (`tasks.service.js`); task delete cascades one level, orphaning grandchildren; custom-field definition delete/retype silently destroys stored values on later merges (`customFields.service.js:34-38`); re-seeding `$set`s role permissions, reverting admin customizations (`seed.core.js:107-111`).
- Six declared `$text` indexes are dead — all searches are unanchored regex collection scans; sort fields unwhitelisted (`utils/pagination.js`).

**AI & realtime scoping (BE):**
- `dailyBrief` returns every employee's report blockers to any `evening_reporting:read` holder, bypassing the reporting module's own owner-only rule (`insights.service.js:166-177, 227`).
- `/ai/ask` gives every employee an arbitrary system prompt and 8192 tokens/call with no per-user quota, usage audit, or provider timeout (`ai.routes.js`); `/finance/ai-insights` costs money behind only `finance:read`.
- All socket mutation events broadcast globally regardless of permissions (`socket/index.js`; rooms exist unused); query-string token fallback should be dropped; sockets never disconnect at token expiry.
- Latent: `LocalStorageProvider.remove()` prefix-check path traversal (`local.provider.js:43-47`) — fix with `path.relative` before any upload feature ships.

**Ops (DevOps):**
- Graceful shutdown never closes Socket.IO or idle connections and has no timeout — SIGTERM hangs until SIGKILL (`index.js:34-56`).
- Health endpoint shares the global rate-limit bucket used by Render's prober (`app.js:60`); hard single-instance assumption (in-memory rate-limit store, no socket Redis adapter); Redis connected but unused, BullMQ dead dependency.
- README quick start references nonexistent npm workspaces and root `dev` script; dead root `vite ^8` devDependency vs client's vite 5; Node pinning inconsistent (`.nvmrc` 22 vs engines >=20 vs render.yaml unset); no production seeding path (fresh deploy has no admin, free plan has no shell).
- `validate.middleware.js` merges instead of replaces `req.query`, letting unvalidated params survive.

**Frontend UX & code health (FE):**
- Silent mutation failures across TaskDetailDrawer (6 mutations), Finance/Products/EmployeeAnalytics/CustomFields deletes — a global MutationCache `onError` toast fixes most in one place.
- No debounce anywhere: search fires a server request per keystroke and collapses boards to spinners (Tasks, Goals, Rrrmas, Finance, Products, Maintenance); `AuditPage.jsx:52` already shows the `keepPreviousData` fix.
- Clear-on-edit bugs beyond tasks: MaintenancePage `buildPayload` drops all cleared fields; ProductsPage can't clear `currentVersion`.
- Date-only values stored as UTC midnight make tasks due today render overdue for IST users (`taskMeta.js:31-33`); Finance's default date is off by a day before 05:30 IST.
- Logout doesn't `queryClient.clear()` (previous user's cached data survives); dashboard index route is the only unguarded module route (`App.jsx:53`); StrictMode removed to mask a refresh race; socket listeners bound once to a replaceable singleton die after re-login.
- Dead weight: unrouted `DashboardPage.jsx` and `AiCopilotPage.jsx`, unused framer-motion/clsx, fully configured 0%-used Tailwind pipeline, `'\custom-fields'` backslash path, heavy copy-paste of helpers/StatCard/Section/chip palettes; TaskCard/ProjectCard not keyboard-operable and drag has no keyboard alternative.

## 6. Team Recommendations & Roadmap

### Sprint 1 — Must-fix (security + deploy safety)

1. **[BE]** Block role escalation: super-admin-only role grants + no self-role modification in `updateUser`/`assignRoles` (C1).
2. **[BE]** Revoke all Sessions + bump/check `passwordChangedAt` on any password change (C3); revoke session family on refresh-token reuse.
3. **[FE+BE+DevOps]** Kill the credential leak (C2): DEV-gate the LoginPage alert; extend `env.js` prod guard to default `SEED_ADMIN_PASSWORD` (and empty `MONGODB_URI`); prod guard in `seed.employees.js`; rotate the Render admin password; scrub README.
4. **[DevOps]** GitHub Actions (ci + lint + smoke + build) on PR/main; enable Render wait-for-CI (H5). Fix broken `npm test` script in the same PR.
5. **[FE]** Fix socket auth staleness with callback auth + `connect_error` refresh-reconnect + tokenStore subscription (H1); make page socket subscriptions survive singleton replacement (a small `onSocket()` helper).
6. **[BE]** Guard contact deletion + user-deletion cleanup (Sessions at minimum) (H2).
7. **[BE]** `.finite().max()` on money amounts (H4); fix `budgetUsage` period math (H3).
8. **[DevOps]** Health endpoint returns 503 on DB-down, mounted before the rate limiter (M1); explicit `syncIndexes()` deploy step (M2); `LOG_LEVEL` env so prod access logs exist (M3); idempotent seed as `preDeployCommand`.
9. **[DevOps]** Harden docker-compose (localhost binds, env creds, Redis auth, relabel dev-only) (H6); switch `STORAGE_PROVIDER` to cloudinary (M10).

### Sprint 2 — Hardening

1. **[BE]** Cookie-only refresh flow: stop returning refreshToken in JSON, `SameSite=lax`, authLimiter on refresh/logout; **[FE]** drop refresh token from localStorage, keep access in memory, handle cross-tab via storage events; reinstate StrictMode.
2. **[BE]** Wire `POST /auth/change-password` + enforce `mustChangePassword`; neutral duplicate-registration response.
3. **[BE]** Route user customFields through `validateValues` (M4); lock reviewed reports + bound backfill dates (M5); business-timezone env for all day-boundary math; recurrence idempotency marker; enforce PEPSI read-only; derive renewal status at read time.
4. **[BE]** Scope socket broadcasts to permission rooms; drop query-string token; row-scope `dailyBrief`; per-user AI rate limit + usage audit + provider timeout.
5. **[FE]** Global MutationCache `onError` toast; shared `useDebounce` + `keepPreviousData` on all search inputs; fix clear-on-edit in TaskDialog/Maintenance/Products; date-only overdue/default-date handling; `queryClient.clear()` on logout; guard the dashboard index route.
6. **[DevOps]** Shutdown hardening (`io.close()`, `closeIdleConnections()`, 10s failsafe exit); AuditLog TTL (M6); tailored CSP; gate Swagger in prod; fix `validate` middleware to replace `req.query`; align Node pinning; fix README quick start + remove dead root vite dep.
7. **[QA]** Land test framework + first four suites (see §7).

### Later — Nice-to-have

- **[FE]** Extract shared CRUD scaffolding (Maintenance's field-config EntityDialog as seed), shared date/format utils, `useSocketInvalidate` hook; split GoalsPage; delete dead pages/deps; remove or adopt Tailwind; keyboard accessibility for cards and a non-drag status change; pagination on Users/Finance tables.
- **[BE]** Money as minor units/Decimal128 grouped by currency; consistent soft-delete strategy repo-wide; `$text`-or-drop search decision; sort-field whitelists; `GET /:id` for budgets/maintenance records; extract shared `escapeRegex`; fix local-storage path traversal before uploads ship; prompt delimiting for AI inputs.
- **[DevOps]** Socket.IO Redis adapter + Redis rate-limit store before any horizontal scaling (or document single-instance); Sentry + uptime monitoring; app Dockerfile if containers are ever intended; remove unused multer/bullmq or wire them.

## 7. Test Strategy (condensed from QA-1/2/3)

**Current state:** 3 hand-rolled smoke scripts, 82/82 passing, ~45 of ~129 endpoints (~30% effective, happy-path, ~4 negative assertions total). Six route groups fully untested. Client: 0%. `npm test` broken. Nothing runs in CI.

**Layer 0 — CI (week 0):** GitHub Actions running the existing smokes (`npm run smoke`) on push/PR with the Mongo binary cached (`MONGOMS_VERSION` pinned — first run downloads ~600MB). Switch smokes to port 0 to kill the fixed-port flake. Extract the bootstrap (`smoke.js:10-24`: env forcing, in-memory Mongo, `seedAll`, `createApp` over HTTP) into a shared `server/src/tests/harness.js`.

**Layer 1 — Server (weeks 1-2):** vitest + supertest reusing the harness. Priority order: (1) **auth** — expired/tampered JWTs, logout/logout-all revocation, cookie-based refresh, register role assignment, authLimiter 429; (2) **RBAC matrix** — table-driven roles × module:action across all 18 groups, `manage` wildcard, dual-guard report routes; (3) **finance money math** — Infinity/1e308/negative rejection, float rounding, budgetUsage boundaries; (4) **IDOR** — employee A vs B on reports/tasks/analytics (route RBAC passes, service scoping must deny); (5) **customFields engine** — full type matrix, immutability, ReDoS pattern guard; then users/roles lifecycle, parameterized 422 negatives (malformed ObjectId must 422 not 500), rrrmas CRUD, task lifecycle edge cases, pepsi/audit/dashboard.

**Layer 2 — Client units (week 1, parallel):** vitest + RTL + MSW. Priority: axios interceptor (single-flight, coalescing, terminal failure → SESSION_EXPIRED; `vi.resetModules` between cases due to module-level state), AuthContext bootstrap + `hasPermission`, ProtectedRoute/RequirePermission, tokenStore, LoginPage validation, `canDragTask` matrix, socket lifecycle.

**Layer 3 — E2E (week 2):** Playwright with the shared harness as `webServer` (hermetic in-memory Mongo, seeded personas). Scenarios: admin login → task CRUD → drag → logout; RBAC denial as limited employee; session expiry → auto-redirect; two-context realtime (`tasks:changed`); deep-link redirect. Prereqs: fix the two bugs tests will immediately trip on (login-page credential alert, socket-listener rebinding) and add ~10 `data-testid`s to E2E-critical elements — MUI class selectors will not survive upgrades.

---

*Key files referenced throughout: `server/src/app.js`, `server/src/config/env.js`, `server/src/modules/users/users.service.js`, `server/src/modules/auth/*`, `server/src/modules/finance/transactions.service.js`, `client/src/lib/{axios,socket,tokenStore}.js`, `client/src/auth/AuthContext.jsx`, `client/src/pages/LoginPage.jsx`, `render.yaml`, `docker-compose.yml`, `server/src/tests/*.smoke.js`.*
