# HRMS ⇄ DDD Integration API Reference

Complete reference for every integration API built between **RAMP HRMS** (source of truth, employees log in here) and **DDD / ITSYBIZZ Command Center** (owner console, mirrors HRMS).

- HRMS backend: `http://<HRMS_HOST>:5000/api/v1`
- DDD server: `http://<DDD_HOST>:5500/api/v1`
- Both respond with the same envelope: `{ "success": true|false, "message": "...", "data": ... }`

---

## 1. Authentication

All service-to-service endpoints are locked with a **shared API key** (no JWT):

```
x-api-key: <INTEGRATION_API_KEY>
```

- The SAME value must exist in `HR-Management-system/backend/.env` and `DDD/server/.env` (`INTEGRATION_API_KEY=`).
- Missing/wrong key → `401 {"success":false,"message":"Invalid API key"}` (timing-safe compare).
- Key not configured on the server → `503`.
- Owner-facing endpoints (marked **JWT**) use the normal `Authorization: Bearer <accessToken>` of that app instead.

---

## 2. HRMS Integration API (called by DDD)

Base: `http://<HRMS_HOST>:5000/api/v1/integration` — all `x-api-key`. Every operation runs through the same HRMS services as the UI (audit-logged as actor `SYSTEM-DDD`), so socket events + DDD echo events fire automatically.

### Bootstrap (full snapshot)
| Method | Path | Notes |
|---|---|---|
| GET | `/bootstrap` | `{employees, attendance(60d), leaves, payroll[{run, aggregates}], openings, candidates, eveningReports(30d)}` — used by DDD "Sync now" |

### Employees
| Method | Path | Body |
|---|---|---|
| POST | `/employees` | `{name*, dept*, role*, email*, phone?, join?, dob?, salary?, gender?, access?, managerId?}` — creates employee **+ HRMS login account** |
| PUT | `/employees/:empId` | same fields, all optional |
| PATCH | `/employees/:empId/toggle-status` | Active ⇄ Inactive |
| DELETE | `/employees/:empId` | soft delete |

### Leaves
| Method | Path | Notes |
|---|---|---|
| PATCH | `/leaves/:code/approve` | `:code` = `LV-####` |
| PATCH | `/leaves/:code/reject` | only from Pending |

### Attendance
| Method | Path | Body |
|---|---|---|
| POST | `/attendance/mark` | `{empId*, status* (P/A/L/W/H), date? (YYYY-MM-DD)}` |

### Payroll
| Method | Path | Body |
|---|---|---|
| POST | `/payroll/run` | `{month* (YYYY-MM)}` — marks all active employees paid |
| POST | `/payroll/pay` | `{month*, empId*}` — pay one employee |

### Recruitment
| Method | Path | Body |
|---|---|---|
| POST | `/openings` | `{title*, dept*, positions?, exp?, status?, posted?}` → returns doc with `code` (`JOB-##`) |
| PUT | `/openings/:code` | partial update |
| PATCH | `/openings/:code/toggle` | Open ⇄ Closed |
| DELETE | `/openings/:code` | soft delete |
| POST | `/candidates` | `{name*, job* (opening title), phone?, exp?, stage?, applied?}` → returns `code` (`CND-##`) |
| PATCH | `/candidates/:code/stage` | `{stage*}` — Applied/Screening/Interview/Offer/Hired/Rejected |
| DELETE | `/candidates/:code` | soft delete |

### Evening reports (owner response)
| Method | Path | Body |
|---|---|---|
| POST | `/evening-reports/:code/response` | `{decision* ('Approved'\|'Rejected'), reason?, by?}` — updates the report **and** pushes a `notification:new` to the employee's HRMS bell |

---

## 3. HRMS Evening Reports API (employee-facing, **JWT**)

Base: `http://<HRMS_HOST>:5000/api/v1/evening-reports`

| Method | Path | Notes |
|---|---|---|
| POST | `/` | `{work*, plan?, blockers?, hours?, date?}` — upserts OWN report for the day (`ER-###`), resets status to `Submitted`, pushes `report.submitted` to DDD |
| GET | `/` | Employee: own history; HR Admin/HR Rep: all. Filters: `status`, `date`, `page`, `limit` |

Frontend: **Evening Report** page in the HRMS portal (People section, visible to all roles).

---

## 4. DDD Integration API (called by HRMS + owner)

Base: `http://<DDD_HOST>:5500/api/v1`

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/integrations/hrms/events` | x-api-key | Event receiver (see catalog below). Unknown event → `200 {ignored:true}` |
| GET | `/integrations/hrms/status` | x-api-key **or** JWT | `{enabled, hrmsReachable, lastSyncAt, counts}` |
| POST | `/integrations/hrms/sync` | JWT (owner) | Full bootstrap pull from HRMS → upserts all mirrors |
| POST | `/payroll/hrms/run` | JWT (owner) | Forward "run payroll" to HRMS |
| POST | `/employee-analytics/employees` | JWT (owner) | Create employee **in HRMS** (forwarded) |
| PUT | `/employee-analytics/employees/:empId` | JWT (owner) | Update employee in HRMS |
| PATCH | `/employee-analytics/employees/:empId/toggle-status` | JWT (owner) | Toggle in HRMS |
| POST | `/employee-analytics/hrms-sync` | JWT (owner) | Legacy alias of `/integrations/hrms/sync` |

**Write-through (no separate endpoints needed):** the standard DDD endpoints below automatically forward to HRMS when the record is HRMS-sourced, then update the mirror:

- `POST /recruitment/positions` / `POST /recruitment/candidates` — **always** create in HRMS first (`JOB-*`/`CND-*` code returned; 502 if HRMS is down, nothing created locally)
- `PATCH /recruitment/candidates/:id/stage`, position update/toggle/delete → forwarded
- `POST /leave/requests/:id/decide` → forwarded to HRMS approve/reject
- `PATCH /reports/:id/approve|reject` → if the report came from HRMS (`externalId ER-*`), the decision is pushed back + employee notified in HRMS

### Event catalog (HRMS → DDD, body: `{event, payload, occurredAt}`)

| Event | Fired on | DDD action |
|---|---|---|
| `employee.created` / `employee.updated` / `employee.status_changed` / `employee.deleted` | employee CRUD, access change | Upsert `User` on `hrmsId=empId` (name/email/dept/designation/status/accessLevel maps) |
| `attendance.marked` | check-in/out, admin mark | Upsert `EmployeeRecord` on `{user,date}` |
| `leave.created` / `leave.decided` / `leave.deleted` | leave lifecycle | Upsert `LeaveRequest` on `externalId=LV-*` |
| `payroll.changed` | run/pay | Upsert `PayrollPeriod` on `{month,'ITSYBIZZ'}` (aggregates only, never individual salaries) |
| `recruitment.opening.changed` / `.deleted` | opening CRUD | Upsert `JobPosition` on `externalId=JOB-*` |
| `recruitment.candidate.changed` / `.deleted` | candidate CRUD/stage | Upsert `Candidate` on `externalId=CND-*` |
| `recruitment.offer.created` | offer letter | Candidate stage → offer + note |
| `report.submitted` | evening report submit | Upsert `DailyReport` (`externalId=ER-*`) + notify owner |

Delivery: fire-and-forget from HRMS with 3 retries (0/2/5s); idempotent upserts, so replays/echoes converge safely.

---

## 5. Realtime (Socket.IO)

Both servers push websocket events so the UIs update without refresh.

**HRMS** — connect to `http://<HRMS_HOST>:5000` with `{auth:{token:<accessToken>}}`:
- Broadcasts: `employees:changed`, `attendance:changed`, `leaves:changed`, `payroll:changed`, `recruitment:changed`, `evening-reports:changed`
- Per-user room: `notification:new` (bell updates instantly — incl. the owner's evening-report response)

**DDD** — connect to `http://<DDD_HOST>:5500` with the owner token:
- `leave:changed`, `payroll:changed`, `recruitment:changed`, `reports:changed`, `users:changed`, `employee_analytics:changed`, `notification:new`

DDD-driven writes fire HRMS events too (they go through the same services), so **both UIs stay live no matter where the change originated**. Measured cross-app latency: 0.14–0.39s.

---

## 6. Enum mappings (HRMS ⇄ DDD)

| Domain | HRMS | DDD |
|---|---|---|
| Leave type | Casual / Sick / Earned | casual / sick / earned |
| Leave status | Pending / Approved / Rejected | pending / approved / rejected |
| Attendance | P / A / L / W / H | present / absent / leave / week_off / holiday |
| Candidate stage | Applied / Screening / Interview / Offer / Hired / Rejected | applied / screening / interview / offer / hired / rejected |
| Payroll status | Pending / Processing / Paid | draft / processing / paid |
| Employee status | Active / Inactive / Exited | active / suspended / exited |
| Access → DDD level | HR Admin → hr_admin · HR Rep / Finance Rep → manager · Employee → employee | |

---

## 7. Errors

| Status | Meaning |
|---|---|
| 401 | Bad/missing `x-api-key` (or expired JWT on owner endpoints) |
| 403 | DDD login attempted by an HRMS employee → "Please use the HRMS portal" |
| 409 | Operation not allowed on an HRMS-managed record (e.g. deleting a synced leave locally) |
| 422 | Validation failure (`errors[{field,message}]`) |
| 502 | **HRMS unreachable** from DDD — the operation was NOT performed anywhere; retry when HRMS is up |
| 503 | Integration key not configured on the server |

### Example calls

```bash
# Full snapshot from HRMS
curl -H "x-api-key: $KEY" http://<HRMS_HOST>:5000/api/v1/integration/bootstrap

# Approve a leave from outside (what DDD does internally)
curl -X PATCH -H "x-api-key: $KEY" http://<HRMS_HOST>:5000/api/v1/integration/leaves/LV-1046/approve

# Push an event to DDD (what HRMS does internally)
curl -X POST -H "x-api-key: $KEY" -H "Content-Type: application/json" \
  -d '{"event":"leave.created","payload":{"code":"LV-9999","emp":"EMP003","type":"Casual","from":"2026-07-25","to":"2026-07-25","days":1,"status":"Pending"}}' \
  http://<DDD_HOST>:5500/api/v1/integrations/hrms/events

# Owner: trigger a full re-sync (DDD JWT)
curl -X POST -H "Authorization: Bearer $OWNER_TOKEN" http://<DDD_HOST>:5500/api/v1/integrations/hrms/sync
```
