# Deployment Guide — HRMS + DDD on Separate Machines

How to run **RAMP HRMS** and the **DDD / ITSYBIZZ Command Center** on two different systems (office LAN). Both talk to each other ONLY over REST + websockets with a shared API key; both databases are MongoDB Atlas (cloud), so each machine just needs internet.

```
┌─────────────────────────────┐         ┌─────────────────────────────┐
│  MACHINE A  (e.g. .1.10)    │         │  MACHINE B  (e.g. .1.20)    │
│  HRMS — employees use this  │  <----> │  DDD — owner uses this      │
│  backend  :5000             │  REST + │  server  :5500              │
│  frontend :5173             │ sockets │  client  :5173              │
└──────────────┬──────────────┘         └──────────────┬──────────────┘
               └────────────── MongoDB Atlas ──────────┘
```

> Replace `192.168.1.10` (HRMS) / `192.168.1.20` (DDD) below with your actual static IPs or hostnames.

## 0. Prerequisites (both machines)

- Node.js 18+ (`node -v`), npm
- Internet access (Atlas DB)
- **Static IP** (or DHCP reservation) — if the IP changes, the integration URLs break
- Both machines set to **IST timezone** (date handling is server-local)

---

## 1. Machine A — HRMS

```bash
cd HR-Management-system/backend
npm ci
```

Edit `backend/.env`:

```env
PORT=5000
CLIENT_URL=http://192.168.1.10:5173          # where the HRMS frontend is served (comma-separated list OK)
# --- DDD integration ---
INTEGRATION_API_KEY=<same 64-char key on both machines>
DDD_API_URL=http://192.168.1.20:5500/api/v1  # points at the DDD machine
INTEGRATION_ENABLED=true
```

First run only (demo/seed data): `npm run seed`

Frontend — edit `frontend/.env`:

```env
VITE_API_URL=http://192.168.1.10:5000/api/v1   # socket URL is derived from this too
```

```bash
cd ../frontend
npm ci
npm run build            # REQUIRED after any VITE_API_URL change (baked at build time)
```

Start (see §4 for auto-start):

```bash
cd ../backend && npm start                     # API on :5000
npx serve -s ../frontend/dist -l 5173          # frontend on :5173
```

## 2. Machine B — DDD

```bash
cd DDD/server
npm ci
```

Edit `server/.env`:

```env
PORT=5500
CLIENT_URL=http://192.168.1.20:5173
# --- HRMS integration ---
INTEGRATION_API_KEY=<same key as Machine A>
HRMS_API_URL=http://192.168.1.10:5000/api/v1   # points at the HRMS machine
HRMS_SYNC_ENABLED=true
```

Client — edit `client/.env`:

```env
VITE_API_URL=http://192.168.1.20:5500/api/v1
```

```bash
cd ../client
npm ci && npm run build
```

Start:

```bash
cd ../server && npm start                      # API on :5500
npx serve -s ../client/dist -l 5173            # owner UI on :5173
```

## 3. Firewall (Windows, run as admin)

Machine A (HRMS):
```powershell
netsh advfirewall firewall add rule name="HRMS API"      dir=in action=allow protocol=TCP localport=5000
netsh advfirewall firewall add rule name="HRMS Frontend" dir=in action=allow protocol=TCP localport=5173
```

Machine B (DDD):
```powershell
netsh advfirewall firewall add rule name="DDD API"    dir=in action=allow protocol=TCP localport=5500
netsh advfirewall firewall add rule name="DDD Client" dir=in action=allow protocol=TCP localport=5173
```

## 4. Auto-start on boot (PM2)

On each machine:

```bash
npm i -g pm2 pm2-windows-startup
```

Machine A:
```bash
cd HR-Management-system/backend
pm2 start src/server.js --name hrms-api
pm2 start "npx serve -s ../frontend/dist -l 5173" --name hrms-web
pm2 save && pm2-startup install
```

Machine B:
```bash
cd DDD/server
pm2 start src/index.js --name ddd-api
pm2 start "npx serve -s ../client/dist -l 5173" --name ddd-web
pm2 save && pm2-startup install
```

Useful: `pm2 status`, `pm2 logs hrms-api`, `pm2 restart ddd-api`.

## 5. Verify the link

```bash
# 1. Both healthy
curl http://192.168.1.10:5000/health
curl http://192.168.1.20:5500/api/v1/health

# 2. Cross-machine reachability + key (from Machine B)
curl -H "x-api-key: $KEY" http://192.168.1.10:5000/api/v1/integration/bootstrap   # expect 200

# 3. In the DDD UI (owner login): sidebar widget should say "HRMS connected" — click "Sync now"

# 4. Realtime: create a position from DDD → it appears in the HRMS portal within a second, no refresh
```

## 6. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| DDD widget shows "HRMS unreachable" / 502 on actions | Machine A down, wrong `HRMS_API_URL`, or firewall blocking :5000 |
| 401 "Invalid API key" between servers | `INTEGRATION_API_KEY` differs between the two `.env` files — must be byte-identical |
| Browser CORS errors | `CLIENT_URL` on that backend doesn't match the exact origin (scheme+host+port) the frontend is served from |
| Frontend loads but calls localhost | Forgot to rebuild after changing `VITE_API_URL` (`npm run build`) |
| Sockets don't connect (lists need manual refresh) | Same CORS/`CLIENT_URL` issue, or the socket port (= API port) blocked by firewall |
| Everything broke after a router restart | Machine IP changed — set static IPs / DHCP reservations, update the four URLs |
| Attendance/leave dates off by one day | A machine is not on IST — fix the OS timezone |
| Employee can't log into DDD | By design — employees use the HRMS portal; DDD is owner-only |

## 7. Exposing over the internet (optional, later)

The shared key travels as a plaintext header — fine inside a LAN, **not** for the public internet. If you ever expose these apps publicly: put both behind a reverse proxy (nginx/Caddy) with HTTPS, keep the API ports closed to the outside, and point the integration URLs at the https:// addresses.

## 8. Phase 2 — ERP & PEPSI integrations (same pattern, dedicated keys)

**itsybizz-ERP** (`:9078`) and the **PEPSI portal** (`:9097`) plug into DDD exactly like HRMS, each with its OWN 64-char key pair (never reuse the HRMS key). Add to DDD `server/.env`:

```env
# --- ERP integration ---
ERP_API_URL=http://<ERP_HOST>:9078/api
ERP_INTEGRATION_API_KEY=<64-char key, same value as on the ERP machine>
ERP_SYNC_ENABLED=true
# --- PEPSI integration ---
PEPSI_API_BASE=http://<PEPSI_HOST>:9097/api
PEPSI_INTEGRATION_API_KEY=<64-char key, same value as on the PEPSI machine>
PEPSI_SYNC_ENABLED=true
# events + UI traffic share one limiter — raise it with integrations on
RATE_LIMIT_MAX=2000
```

On the ERP machine (`itsybizz-erp/itsybizzerp/.env`) and the PEPSI machine (`pepsi-src/pepsi/.env`) — the same three vars on each, key matching its DDD-side counterpart above:

```env
DDD_API_URL=http://<DDD_HOST>:5500/api/v1      # your DDD port (local dev uses 8000)
INTEGRATION_API_KEY=<that system's key>
INTEGRATION_ENABLED=true
```

Firewall: open TCP **9078** (ERP) / **9097** (PEPSI) the same way as §3. Prod placeholder hostnames: `erpapi.itsybizz.com`, `pepsiapi.itsybizz.com`.

- **Boot order doesn't matter** — every system runs standalone; missed events are converged any time via "Sync now" (ERP) / "Pull from PEPSI" in the DDD UI.
- **Rollback** — set `INTEGRATION_ENABLED=false` on the source (or clear the key on DDD): nothing breaks, DDD mirrors just go stale; re-enable + sync to converge.
- Verify: `curl -H "x-api-key: $KEY" http://<ERP_HOST>:9078/api/integration/bootstrap` and `curl -H "x-api-key: $KEY" http://<PEPSI_HOST>:9097/api/integration/projects` → both 200 (wrong key → 401).
- ⚠️ `itsybizz-erp` and `pepsi-src` are **not git repositories** — back those trees up by other means before touching prod.

---
*See `INTEGRATION_API.md` (same folder) for the full API reference of every integration endpoint, event, and socket channel — HRMS in §1–7, ERP & PEPSI in §8–23.*
