# Integration API Reference — HRMS / ERP / PEPSI ⇄ DDD

Complete reference for every integration API built between the **DDD / ITSYBIZZ Command Center** (owner console) and its source systems: **RAMP HRMS** (employees — §1–7), **itsybizz-ERP** (inventory / production / sales — §10–11) and the **PEPSI execution portal** (projects / customers / deals — §12–13). Each source system stays the source of truth; DDD mirrors it.

- HRMS backend: `http://<HRMS_HOST>:5000/api/v1`
- DDD server: `http://<DDD_HOST>:5500/api/v1` — current local dev runs on **:8000** (`server/.env` `PORT`); the `:5500` in the HRMS examples below predates the port move, substitute your configured port
- ERP backend: `http://<ERP_HOST>:9078/api` (prod placeholder `https://erpapi.itsybizz.com/api`)
- PEPSI backend: `http://<PEPSI_HOST>:9097/api` (prod placeholder `https://pepsiapi.itsybizz.com/api`)
- HRMS + DDD respond with the same envelope: `{ "success": true|false, "message": "...", "data": ... }`. ERP keeps its native shapes (`{message}` on errors), PEPSI uses `{error}` — both documented as-is below.

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
- Phase 2 adds **dedicated per-system keys** for ERP and PEPSI (a leaked key only opens its own inbox) — see §9. The HRMS key above is unchanged.

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

---

## 8. Phase 2 — three systems, one console

Phase 2 (Jul-2026, QA-verified) wires **itsybizz-ERP** and the **PEPSI execution portal** into DDD using the exact pattern proven with HRMS:

```
                ┌────────────────────────────────────────────────┐
                │        DDD / ITSYBIZZ Command Center           │
                │        (owner console)  :8000  /api/v1         │
                └─────┬──────────────────┬──────────────────┬────┘
                      │                  │                  │
     events ↑ / ops ↓ │ events ↑ / ops ↓ │ events ↑ / ops ↓ │
          x-api-key:  │      x-api-key:  │      x-api-key:  │
        INTEGRATION_  │  ERP_INTEGRATION │  PEPSI_INTEGRATION
             API_KEY  │         _API_KEY │           _API_KEY
              ┌───────▼──────┐   ┌───────▼──────┐   ┌───────▼──────┐
              │  RAMP HRMS   │   │ itsybizz-ERP │   │ PEPSI portal │
              │ :5000 /api/v1│   │  :9078 /api  │   │  :9097 /api  │
              └──────────────┘   └──────────────┘   └──────────────┘
```

Every spoke follows the same five-part recipe (§1–7 describe it for HRMS):

1. **Event push** — the source POSTs `{event, payload, occurredAt}` to DDD `/integrations/<src>/events`; fire-and-forget with 3 retries (0/2/5s), never blocks or fails the source's own request path.
2. **Idempotent mirrors** — every DDD mirror row is keyed on `externalId` (unique sparse) + a `source`/`sourceSystem` discriminator; upserts converge on replays and write-through echoes; deletes are source-scoped, so manual rows are never touched.
3. **Write-through-first** — owner ops in DDD forward to the source system FIRST; on failure the error propagates (502 unreachable / real status) and **nothing mutates locally**. On success the mirror is upserted from the source's response; the echo event converges again harmlessly.
4. **Bootstrap sync** — one source endpoint returns a full snapshot; DDD "Sync now" replays it into the mirrors (idempotent, safe to run anytime).
5. **Socket nudges** — every mirror change broadcasts (`erp:changed` / `rrrmas:changed`) so the owner UI refetches without refresh.

One structural difference: the ERP mirrors eight entity types through per-event payloads (like HRMS); PEPSI stores its whole app as **one state blob**, so it pushes a single "state changed" event and DDD re-pulls a snapshot instead (coalesced — see §13).

---

## 9. Authentication — dedicated per-system keys

Same model as §1 (`x-api-key` header, timing-safe compare, no JWT on machine routes) but each system pair has its OWN key — a leaked ERP key never opens the HRMS or PEPSI inboxes. **Key values live only in `.env` files — never in source, docs, or version control.**

| Link | DDD `server/.env` vars | Peer-side vars | Peer `.env` file |
|---|---|---|---|
| HRMS ⇄ DDD | `INTEGRATION_API_KEY` + `HRMS_API_URL` + `HRMS_SYNC_ENABLED` | `INTEGRATION_API_KEY` + `DDD_API_URL` + `INTEGRATION_ENABLED` | `HR-Management-system/backend/.env` |
| ERP ⇄ DDD | `ERP_INTEGRATION_API_KEY` + `ERP_API_URL` + `ERP_SYNC_ENABLED` | `INTEGRATION_API_KEY` + `DDD_API_URL` + `INTEGRATION_ENABLED` | `itsybizz-erp/itsybizzerp/.env` |
| PEPSI ⇄ DDD | `PEPSI_INTEGRATION_API_KEY` + `PEPSI_API_BASE` | `INTEGRATION_API_KEY` + `DDD_API_URL` + `INTEGRATION_ENABLED` | `pepsi-src/pepsi/.env` |

The DDD-side key var and the peer's `INTEGRATION_API_KEY` must hold the SAME value per link (each peer names its own key `INTEGRATION_API_KEY` locally — the pairing is per row above).

- All three receivers compare with `crypto.timingSafeEqual` (the ERP SHA-256-hashes both sides first, PEPSI length-guards) — no early-exit string compare anywhere.
- Missing/wrong key → `401` — DDD: `INVALID_API_KEY`; ERP: `{"message":"Invalid API key"}`; PEPSI: `{"error":"Invalid API key"}`.
- Key not configured on the receiver → `503` — DDD: `INTEGRATION_DISABLED`; ERP/PEPSI: "Integration API key not configured".
- Owner-facing endpoints (marked **JWT**) use the normal DDD `Authorization: Bearer <accessToken>`.
- Source-side emitters are gated by `INTEGRATION_ENABLED` + `DDD_API_URL` + `INTEGRATION_API_KEY` — unset any one and that system stops pushing (and runs fully standalone; see §19).

---

## 10. ERP Integration API (called by DDD)

Base: `http://<ERP_HOST>:9078/api/integration` — all `x-api-key` (ERP key). Mounted BEFORE the ERP's JWT `protect` gate; runs as fixed actor `SYSTEM-DDD`. Every endpoint **reuses the same controllers as the ERP UI**, so validation, barcode/serial generation, delete guards and event emission all run exactly once (the echo event back to DDD converges idempotently). Responses are ERP-native shapes — no `{success,data}` envelope, errors are `{message}`.

### Bootstrap + traceability
| Method | Path | Notes |
|---|---|---|
| GET | `/bootstrap` | `{suppliers, customers, rawMaterials (5000 newest), finishedGoods, boms, salesOrders, assets, users, stats}` — lean + populated like the ERP list endpoints (salesOrders carry a populated `customer` object, finishedGoods populated `rawMaterials {_id, barcode, materialType, model}`); users NEVER include passwords |
| GET | `/track/:code` | Traceability passport for any barcode (`{kind:'raw_material'\|'finished_good', …}`) — same logic as the ERP UI |

### Write-through (bodies identical to the ERP UI's own endpoints)
| Method | Path | Body |
|---|---|---|
| POST / PUT / DELETE | `/suppliers(/:id)` | `{name*, contact?, email?, address?, gstin?, notes?}` |
| POST / PUT / DELETE | `/customers(/:id)` | same shape |
| POST | `/raw-materials` | batch receive: `{materialType*, quantity=1, supplier? (ERP _id), serials? (array or newline string), purchaseDate?, model?, specification?, warranty?, remarks?, prefix?}` → one unit per `quantity`, barcodes `<PREFIX><DDMMYY><seq>`, supplier details snapshotted per unit |
| PUT / DELETE | `/raw-materials/:id` | partial update / delete (400 if consumed) |
| POST | `/finished-goods` | production build: `{productCode='KS1', productName?, rawMaterialBarcodes*[], productionDate?, bom?}` — validates + consumes the listed RM units, mints the FG barcode |
| PUT | `/finished-goods/:id/qc` | `{result* ('passed'\|'failed'), checklist?, qcBy?, qcRemarks?}` |
| DELETE | `/finished-goods/:id` | releases its raw materials back to stock (400 if dispatched) |
| POST / PUT / DELETE | `/boms(/:id)` | `{productName*, productCode?, outputQuantity?, materials?[{materialType, quantity, unitCost, notes}], processes?[{name, description, cost}], status?, remarks?}` |
| POST | `/sales-orders` | `{customer* (ERP _id), productCode='KS1', productName?, orderedQty*, notes?, orderDate?}` |
| PUT | `/sales-orders/:id` | partial update |
| POST | `/sales-orders/:id/dispatch` | `{finishedGoodBarcodes*[]}` — flips those FGs to dispatched, bumps `deliveredQty`/`status` |
| DELETE | `/sales-orders/:id` | 400 if the order already has dispatches |
| POST / PUT / DELETE | `/assets(/:id)` | `{name*, assetType?, tag?, purchaseDate?, purchasedBy?, notes?}` |
| POST | `/assets/:id/assign` | `{person*, date?, note?}` |
| POST | `/assets/:id/return` | `{date?, note?}` |
| POST / PUT / DELETE | `/users(/:id)` | `{name*, username?, email?, password?, role?, status?}` — password write-only, never echoed |

**Delete guards (pass through to DDD as `400 {message}`):** consumed raw material → "Cannot delete — this unit is already used in a finished good" · dispatched finished good → "Cannot delete a dispatched finished good" · order with dispatches → "Cannot delete an order that already has dispatches".

---

## 11. DDD ERP Integration API (called by ERP + owner)

Base: `http://<DDD_HOST>:8000/api/v1`

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/integrations/erp/events` | x-api-key (ERP) | Event receiver (catalog below). Unknown event → `200 {ignored:true}` |
| GET | `/integrations/erp/status` | x-api-key **or** JWT | `{enabled, erpReachable, lastSyncAt, counts}` (per-mirror counts incl. erp contacts) |
| POST | `/integrations/erp/sync` | JWT (owner) | Full bootstrap pull → upserts in dependency order suppliers → customers → boms → rawMaterials → finishedGoods → salesOrders → assets → users; returns per-model counts |

### Event catalog (ERP → DDD, body `{event, payload, occurredAt}`) — 27 events

| Event | Payload | DDD action |
|---|---|---|
| `erp.supplier.created` / `.updated` | full supplier doc | Upsert `Contact` on `{externalId: _id, sourceSystem:'erp'}`, `type:'supplier'` |
| `erp.supplier.deleted` | `{id}` | Delete that Contact (source-scoped) |
| `erp.customer.created` / `.updated` / `.deleted` | same pattern | `type:'customer'` |
| `erp.rawmaterial.received` | `{items:[full docs]}` — ONE event per batch | Upsert an `ErpRawMaterial` mirror per item |
| `erp.rawmaterial.updated` | full doc | Upsert |
| `erp.rawmaterial.deleted` | `{id, barcode}` | Delete mirror |
| `erp.finishedgood.built` | full FG doc (populated rawMaterials) | Upsert `ErpFinishedGood` + flip the listed RM mirrors to `consumed` (sets `consumedInFgExternalId`) |
| `erp.finishedgood.qc` | full FG doc | Upsert (qcStatus / qcBy / qcRemarks / qcDate) |
| `erp.finishedgood.deleted` | `{id, barcode, releasedRawMaterialIds}` | Delete mirror + flip those RMs back to `in_stock` (falls back to the mirror's own RM list if the payload list is empty) |
| `erp.bom.created` / `.updated` | full doc | Upsert `ErpBom` |
| `erp.bom.deleted` | `{id}` | Delete |
| `erp.salesorder.created` / `.updated` | full order doc | Upsert `ErpSalesOrder` |
| `erp.salesorder.dispatched` | `{order, dispatchedFinishedGoodIds}` | Upsert order + flip those FG mirrors to `dispatched` |
| `erp.salesorder.deleted` | `{id, orderNo}` | Delete |
| `erp.asset.created` / `.updated` / `.assigned` / `.returned` | full asset doc (incl. history) | Upsert `ErpAsset` |
| `erp.asset.deleted` | `{id}` | Delete |
| `erp.user.created` / `.updated` | doc WITHOUT password | Upsert `ErpUser` |
| `erp.user.deleted` | `{id}` | Delete |

Delivery: fire-and-forget from the ERP with 3 retries (0/2/5s); idempotent upserts, so replays/echoes converge safely (measured live: mirror appears within ~40 ms of the ERP write). Every handled event broadcasts `erp:changed {type:'erp:<event>', at}`.

### Data mapping (ERP entity → DDD mirror)

| ERP entity | DDD model | Key fields |
|---|---|---|
| Supplier | `Contact` | `externalId` = ERP `_id`, `sourceSystem:'erp'`, `type:'supplier'`; full ERP fields under `customFields.erp {contact, address, gstin, notes}`; DDD-owned notes/owner/tags untouched by sync |
| Customer | `Contact` | same, `type:'customer'` |
| RawMaterial | `ErpRawMaterial` | barcode (indexed), materialType, supplier snapshot, status `in_stock/consumed`, `consumedInFgExternalId` |
| FinishedGood | `ErpFinishedGood` | barcode, productCode/Name, qcStatus `pending/passed/failed`, status `in_stock/dispatched`, `rawMaterials [{externalId, barcode, materialType}]` |
| Bom | `ErpBom` | materials/processes + cost roll-ups |
| SalesOrder | `ErpSalesOrder` | orderNo, customerExternalId/Name, status `open/partial/completed`, `deliveries[].finishedGoodExternalIds` |
| Asset | `ErpAsset` | status `available/assigned`, currentHolder, action history |
| User | `ErpUser` | role/status only — passwords are never stored in DDD |

**Why `externalId` = ERP Mongo `_id` and not the barcode:** barcodes (`RAM230726001`, …) are day-serial *display* keys — after a delete the same serial can be minted again for a brand-new unit, so a barcode is not a stable identity. `_id` is immutable and unique forever. Barcodes stay indexed on the mirrors for search and dispatch-by-barcode.

### Owner module `/erp/*` (all **JWT**)

Lists serve from LOCAL mirrors (fast, keep working when the ERP is down); writes go to the ERP FIRST (§10), then upsert the mirror from the ERP response and broadcast `erp:changed`. `:externalId` in every path IS the ERP `_id` (24-hex, same string both sides — no translation table).

| Method | Path | Body / notes |
|---|---|---|
| GET | `/erp/overview` | `{rawMaterials:{inStock, consumed, byType[]}, finishedGoods:{inStock, dispatched, pendingQC, passed, failed}, salesOrders:{open, partial, completed}, assets:{available, assigned}, contacts:{suppliers, customers}, users, erpReachable, lastSyncAt}` |
| GET | `/erp/track/:code` | LIVE proxy to ERP `/integration/track/:code` (502 when the ERP is down) |
| GET+POST | `/erp/suppliers` · PATCH+DELETE `/erp/suppliers/:externalId` | list from Contact mirrors (`page/limit/search`); body = ERP shape `{name*, contact?, email?, address?, gstin?, notes?}` |
| GET+POST | `/erp/customers` (+ PATCH/DELETE `/:externalId`) | same |
| GET | `/erp/raw-materials` | filters `type`, `status (in_stock\|consumed)`, `search` + pagination |
| POST | `/erp/raw-materials` | batch receive `{materialType*, quantity* (1–500), supplierExternalId?, serials?, purchaseDate?, model?, specification?, warranty?, remarks?}` — `supplierExternalId` maps to the ERP `supplier` field |
| PATCH | `/erp/raw-materials/:externalId` | detail fields only — status/barcode stay ERP-managed (build/delete cascades own them) |
| DELETE | `/erp/raw-materials/:externalId` | 400 passthrough if consumed |
| GET | `/erp/finished-goods` | filters `status`, `qc`, `search` |
| POST | `/erp/finished-goods` | build `{productCode*, productName?, rawMaterialBarcodes*[], bomExternalId?, productionDate?}` |
| POST | `/erp/finished-goods/:externalId/qc` | `{result* ('passed'\|'failed'), checklist?, qcBy?, qcRemarks?}` |
| DELETE | `/erp/finished-goods/:externalId` | 400 passthrough if dispatched |
| GET+POST | `/erp/boms` · PATCH+DELETE `/:externalId` | `{productName*, productCode?, outputQuantity?, materials?, processes?, status?, remarks?}` |
| GET+POST | `/erp/sales-orders` | create `{customerExternalId*, orderedQty*, productCode?, productName?, orderDate?, notes?}` |
| PATCH | `/erp/sales-orders/:externalId` | excludes deliveredQty/status/deliveries — dispatch owns them |
| POST | `/erp/sales-orders/:externalId/dispatch` | `{finishedGoodBarcodes*[]}` |
| DELETE | `/erp/sales-orders/:externalId` | 400 passthrough if the order has dispatches |
| GET+POST | `/erp/assets` · PATCH+DELETE `/:externalId` | `{name*, assetType?, tag?, purchaseDate?, purchasedBy?, notes?}` |
| POST | `/erp/assets/:externalId/assign` | `{person*, note?, date?}` |
| POST | `/erp/assets/:externalId/return` | — |
| GET+POST | `/erp/users` · PATCH+DELETE `/:externalId` | `{name*, username?, email?, password?, role?, status?}` — password forwarded only, never stored |

Frontend: **ERP** entry in the sidebar (Business section) → one page with 8 tabs (Overview / Inventory / Production / Sales / Assets / Masters / Users / Track); "Sync now" lives on the Overview tab. `GET /dashboard/overview` gains an `erp` section: `{rawMaterialsInStock, finishedGoodsInStock, pendingQC, openOrders, dispatchedThisMonth, assetsAssigned}`.

---

## 12. PEPSI Integration API (called by DDD)

### The blob + concurrency model (read this first)

All PEPSI app data is ONE `TenantState` document per tenant: `{tenantId, data, version, updatedBy}` — the SPA loads the whole blob at boot and PUTs whole snapshots back (700 ms debounce). Concurrency is handled in three layers:

- **Last-write-wins (legacy, still the default):** a versionless `PUT /api/state` always wins — old clients keep working unchanged.
- **Opt-in optimistic locking (new):** the SPA now sends its known `version` with every PUT; if stale, the server answers `409 version_conflict` with the fresh (role-masked) snapshot and the SPA adopts it (restore → re-render → "Updated from another session — view refreshed" toast). A 30 s `GET /api/state/version` poll (skipped while a save is pending) catches remote changes between saves.
- **Server-side per-entity mutation (integration writes):** DDD ops never PUT the whole blob — each `/api/integration` mutation loads the doc, edits just the target entity server-side, saves with `$inc version`, and prepends an `AUDIT` entry `{ts, user:'DDD Command Centre', act, det}` (newest-first, same timestamp format as the SPA's own log). A DDD write can therefore never clobber unrelated portal data.

Every successful mutation (SPA PUT, integration write, reset) then emits `pepsi.state.updated {version}` to DDD.

### `/api/integration/*` (x-api-key, PEPSI key)

Base: `http://<PEPSI_HOST>:9097/api/integration`. Reads are UNMASKED (server-to-server — contract values included regardless of role masking). Errors are `{error}`.

| Method | Path | Body / notes |
|---|---|---|
| GET | `/projects` | `[wire project…]` (shape in §13) — empty array if the blob was never seeded |
| GET | `/bootstrap` | `{projects, customers, leads, version}` |
| POST | `/projects` | `{name*, customerExternalId?, location?, workType?, contractValue?, pmName?, startDate?, endDate?, statusNote?}` → `201` wire project. Allocates `PRJ-<max numeric suffix + 1>` (floor 2600), a deduped 3-letter `short` code, and the 8 SPA-identical default stages; unknown `customerExternalId` → 404 |
| PUT | `/projects/:id` | merges ONLY the DDD-writable set (§13); 404 unknown id; returns the wire project |
| DELETE | `/projects/:id` | splices the project and cleans up: its `BUD` budget, `TESTS/NCR/EXP/TASKS/DOCS` rows, positional `RISK` rows, and `GATE`/`GGATE` keys prefixed `<short>-` |
| POST | `/customers` | `{name*, industry?, site?, contractValue?, status?}` → `CUST-<seq>` |
| PUT | `/customers/:id` | partial |
| DELETE | `/customers/:id` | `409 {error:'Customer has projects'}` if any project references it |
| POST | `/leads` | `{title*, customerExternalId?, prospect?, type?, stage?, value?, probability?, owner?, source?, closeDate?, nextAction?, note?}` → `OPP-<seq>` |
| PUT | `/leads/:id` | partial |
| DELETE | `/leads/:id` | — |

Mutations against a never-seeded blob → `409 {error:'PEPSI state not initialised — open the portal once so the SPA seeds it'}` (reads return empty arrays instead).

### `/api/state` changes (SPA-facing, **JWT**)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/state/version` | `{version}` — lightweight staleness probe (SPA 30 s poll + integrations) |
| PUT | `/api/state` | now accepts an optional numeric `version`; stale (`version < doc.version`) → `409 {error:'version_conflict', version:<current>, data:<fresh role-masked snapshot>}`; versionless → legacy last-write-wins, unchanged. Every successful PUT emits `pepsi.state.updated` |
| POST | `/api/state/reset` | Super Admin only; emits `pepsi.state.updated {version:0, reset:true}` |

---

## 13. DDD PEPSI Integration API (called by PEPSI + owner)

Base: `http://<DDD_HOST>:8000/api/v1`

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/integrations/pepsi/events` | x-api-key (PEPSI) | `pepsi.state.updated` → coalesced pull (below), returns `{handled:true, scheduled:true}`; unknown event → `200 {ignored:true}` |
| GET | `/integrations/pepsi/status` | JWT | `{projects, customers, leads, pepsiReachable, lastSyncedAt}` |
| POST | `/integrations/pepsi/pull` | JWT (owner) | Live API bootstrap pull with fallback to the bundled snapshot; returns `{source:'api'\|'snapshot', …counts}` |
| POST | `/integrations/pepsi/sync` | JWT | Legacy push-shaped sync (body `{projects:[wire…]}`) — kept for compatibility |

**Coalesced pull — the design and why:** the PEPSI event carries only `{version}`, no entity payloads, because the blob is one document — any change may touch arbitrary slices of the derived wire shapes (budgets, gates, positional risk rows, …). Rather than diffing, DDD re-arms a **5 s trailing-edge timer** per event and then runs ONE full bootstrap pull, so an SPA autosave burst (one event per ~700 ms save) becomes a single sync. Event-triggered pulls deliberately do NOT fall back to the bundled snapshot — a transient fetch failure must never overwrite freshly-pushed portal state with stale seed data (the owner `/pull` and the background scheduler keep full fallback).

### Data mapping (PEPSI blob → wire → DDD)

| Blob | Wire (via `pepsi/src/lib/wire.js`) | DDD model |
|---|---|---|
| `P[]` project row | `{externalId, code, name, customerName, location, workType, contractValue, health, spi, cpi, currentStage{index,total,name}, pmName, startDate, endDate, progress, statusNote, blocked, milestones, stages, budgetLines, openItems, ncrs, tests, risksExternal, teamExternal, quotations, expenses}` | `Project` (`source:'pepsi'`, `externalId` = `PRJ-*`); `expenses` → `expensesExternal[] {externalId, category, amount, by, date, status, paid, note, rejectReason}`, `blocked` → `blocked` (both new, additive) |
| `CUST[]` | `{externalId, name, industry, site, contractValue, status}` | `Contact` `{sourceSystem:'pepsi', type:'customer'}` + `customFields.pepsi {industry, site, contractValue, portalStatus}` |
| `LEADS[]` | `{externalId, title, customerExternalId, prospect, type, stage, value, probability, owner, source, closeDate, nextAction, note}` | `Contact` `{sourceSystem:'pepsi', type:'lead'}`, name = title, company = prospect ∥ customer name, + `customFields.pepsi {stage, value, probability, owner, source, closeDate, nextAction, note, customerExternalId}` |

| Map | Values |
|---|---|
| Project health (blob → wire) | `gn → on_track` · `am → at_risk` · `rd → critical` (reverse-mapped on writes) |
| currentStage | **1-based** on the wire: `{index: blob stage + 1, total: 8, name}` |
| Lead stage → Contact status | Lead → new · Qualified → qualified · Proposal → contacted · Negotiation → contacted · Won → active · Lost → lost |

### Write-through (standard DDD endpoints, no separate paths)

- `POST/PATCH/DELETE /rrrmas/projects*` — for pepsi-sourced rows the **writable set** `name, location, workType, contractValue, pmName, startDate, endDate, statusNote, health, blocked` is forwarded to `/integration/projects` FIRST, then the mirror is re-mapped from the returned wire project. Fields DDD owns locally (tags, manager, team, owner, custom fields) update locally only. A forward that is needed but has no `externalId` → `409 PEPSI_NO_EXTERNAL_ID` ("run a sync first"). Everything else — stages, milestones, gates, tests, NCRs, tasks, expenses — is portal-owned and **read-only in DDD**.
- `PATCH/DELETE /rrrmas/contacts/:id` — pepsi-sourced rows forward by id prefix (`CUST-*` → `/integration/customers/:id`, `OPP-*` → `/integration/leads/:id`); **erp-sourced rows → `409 ERP_MANAGED`** ("Managed by ERP — use the ERP section"); manual rows and the referenced-delete guard unchanged.

Frontend: the project drawer gains a read-only **Expenses** section + a **Blocked** badge; the RRRMAS page regains a **Contacts** tab with source chips (ERP rows edit-locked in the UI too); "Pull from PEPSI" button on the Projects overview page.

---

## 14. Realtime (Phase 2)

DDD (connect to `http://<DDD_HOST>:8000` with the owner token — same socket as §5):
- `erp:changed {type:'erp:<event>', at}` — after every ERP mirror change (inbound event, bootstrap sync, or write-through)
- `rrrmas:changed {type:'pepsi:event-sync'\|'pepsi:pull'\|'pepsi:sync', at}` — after every PEPSI sync

The ERP and PEPSI frontends have no DDD socket link: the ERP UI reads its own DB (unchanged), and the PEPSI SPA converges via the 30 s version poll + 409-adopt (§12).

---

## 15. Flow walkthroughs

**ERP**
1. *Bootstrap* — owner clicks Sync now → DDD `GET {ERP_API_URL}/integration/bootstrap` → upserts mirrors in dependency order → `erp:changed`.
2. *Live event* — user receives stock in the ERP UI → controller mutates → `erp.rawmaterial.received {items}` pushed to DDD → per-item mirror upsert → `erp:changed` (mirrors converge within ~40 ms).
3. *Write-through* — owner builds a finished good in DDD → DDD `POST {ERP_API_URL}/integration/finished-goods` (the ERP consumes the RMs, mints the barcode, emits the echo event) → DDD upserts the mirror from the response; the echo converges idempotently.
4. *Failure/recovery* — ERP down → write-through returns `502 ERP_UNREACHABLE`, nothing mutated anywhere; mirror reads keep serving; `/status` shows `erpReachable:false`; after restart the same call succeeds — run Sync now to catch up on any events missed while down.

**PEPSI**
1. *Bootstrap* — owner clicks Pull from PEPSI → DDD `GET {PEPSI_API_BASE}/integration/bootstrap` → upserts projects + customers + leads (`source:'api'`); if the key/API is unavailable, falls back to the bundled snapshot (`source:'snapshot'`).
2. *Live event* — portal user edits, the SPA autosaves → `PUT /api/state` bumps the version + emits `pepsi.state.updated {version}` → DDD coalesces 5 s → one bootstrap pull → `rrrmas:changed` (measured end-to-end: ~5.1 s).
3. *Write-through* — owner edits a pepsi project in DDD → `PUT /integration/projects/PRJ-…` (server-side entity mutation, version bump, 'DDD Command Centre' audit entry) → mirror re-mapped from the wire echo; portal sessions converge via their version poll.
4. *Conflict* — two portal sessions: the stale one's versioned PUT → `409 version_conflict` + fresh snapshot → SPA adopts + toast; nothing is lost silently unless the client is versionless (legacy last-write-wins).
5. *Failure/recovery* — Pepsi down → DDD write-through `502 PEPSI_UNREACHABLE`, mirror untouched; inbound events still answer `200 {scheduled:true}` and the failed pull logs a warning without snapshot fallback; after restart the next event/pull converges.

---

## 16. Errors (ERP & PEPSI) — verified behaviours

| Status | Case | Behaviour |
|---|---|---|
| 401 | bad/missing `x-api-key` | DDD `INVALID_API_KEY` · ERP `{"message":"Invalid API key"}` · PEPSI `{"error":"Invalid API key"}` |
| 503 | key not configured on the receiver | DDD `INTEGRATION_DISABLED` · ERP/PEPSI "Integration API key not configured" |
| 502 | source unreachable on write-through | `ERP_UNREACHABLE` / `PEPSI_UNREACHABLE` — **the operation was NOT performed anywhere** (verified: zero ghost mirrors); retry when the source is up |
| 400 | ERP delete guard tripped | ERP `{message}` passed through verbatim (consumed RM / dispatched FG / delivered SO); mirrors untouched |
| 409 | stale versioned `PUT /api/state` | `{error:'version_conflict', version, data:<fresh role-masked snapshot>}` |
| 409 | PEPSI blob never seeded | `{error:'PEPSI state not initialised — open the portal once so the SPA seeds it'}` |
| 409 | pepsi row without `externalId` needs forwarding | `PEPSI_NO_EXTERNAL_ID` — run a sync first |
| 409 | editing an erp-sourced contact in RRRMAS | `ERP_MANAGED` — use the ERP section |
| 409 | deleting a referenced PEPSI customer | `{error:'Customer has projects'}` |
| 200 | unknown inbound event | `{ignored:true}` (forward-compatible) |

Dev-mode note: DDD error bodies include a `stack` field while `NODE_ENV` is unset/development — it disappears with `NODE_ENV=production`.

### Example calls

```bash
# ERP snapshot (what DDD "Sync now" pulls)
curl -H "x-api-key: $ERP_KEY" http://<ERP_HOST>:9078/api/integration/bootstrap

# Push an ERP event to DDD (what the ERP does internally)
curl -X POST -H "x-api-key: $ERP_KEY" -H "Content-Type: application/json" \
  -d '{"event":"erp.supplier.created","payload":{"_id":"64b0...","name":"Corsair India"}}' \
  http://<DDD_HOST>:8000/api/v1/integrations/erp/events

# PEPSI wire projects (unmasked, server-to-server)
curl -H "x-api-key: $PEPSI_KEY" http://<PEPSI_HOST>:9097/api/integration/projects

# Nudge DDD that PEPSI state changed (what the portal does after every save)
curl -X POST -H "x-api-key: $PEPSI_KEY" -H "Content-Type: application/json" \
  -d '{"event":"pepsi.state.updated","payload":{"version":42}}' \
  http://<DDD_HOST>:8000/api/v1/integrations/pepsi/events
```

---

## 17. Environment variable reference

Names only — the values live in each system's `.env` and must never be committed or pasted into docs.

**DDD (`DDD/server/.env`)**
| Var | Default | Purpose |
|---|---|---|
| `ERP_API_URL` | `''` | ERP API base (e.g. `http://localhost:9078/api`); empty disables outbound ERP calls |
| `ERP_INTEGRATION_API_KEY` | `''` | Guards inbound `/integrations/erp/*`; stamped on outbound ERP calls. Same value as the ERP's `INTEGRATION_API_KEY` |
| `ERP_SYNC_ENABLED` | `false` | ERP sync feature gate (drives `enabled` in `/status`) |
| `PEPSI_API_BASE` | `https://pepsiapi.itsybizz.com/api` | PEPSI API base (local: `http://localhost:9097/api`) |
| `PEPSI_INTEGRATION_API_KEY` | `''` | Guards inbound `/integrations/pepsi/events`; stamped on outbound PEPSI calls (preferred over the legacy login flow). Same value as PEPSI's `INTEGRATION_API_KEY` |
| `PEPSI_SYNC_ENABLED` | `false` | Background PEPSI sync scheduler on/off |
| `PEPSI_SYNC_INTERVAL_MS` | `1800000` | Scheduler interval (30 min) |
| `RATE_LIMIT_MAX` | `300` | Global limiter per 15 min — raise to `2000` with integrations on (see §18) |
| `INTEGRATION_API_KEY` / `HRMS_API_URL` / `HRMS_SYNC_ENABLED` | — | HRMS link, unchanged (§1) |

**itsybizz-ERP (`itsybizz-erp/itsybizzerp/.env`)**
| Var | Purpose |
|---|---|
| `DDD_API_URL` | DDD API base (e.g. `http://localhost:8000/api/v1`) |
| `INTEGRATION_API_KEY` | Guards inbound `/api/integration/*`; stamped on outbound events. Same value as DDD's `ERP_INTEGRATION_API_KEY` |
| `INTEGRATION_ENABLED` | Master switch for event emission (`true`/`false`) |

**PEPSI (`pepsi-src/pepsi/.env`, placeholders mirrored in `.env.example`)**
| Var | Purpose |
|---|---|
| `DDD_API_URL` | DDD API base (e.g. `http://localhost:8000/api/v1`) |
| `INTEGRATION_API_KEY` | Guards inbound `/api/integration/*`; stamped on outbound events. Same value as DDD's `PEPSI_INTEGRATION_API_KEY` |
| `INTEGRATION_ENABLED` | Master switch for event emission (`true`/`false`) |

---

## 18. Deployment notes

| System | Local port | Prod placeholder |
|---|---|---|
| DDD server | **8000** (`server/.env` `PORT`; earlier HRMS-era examples use :5500) | — |
| itsybizz-ERP | **9078** | `https://erpapi.itsybizz.com` |
| PEPSI | **9097** | `https://pepsiapi.itsybizz.com` |
| HRMS | 5000 (unchanged) | — |

- **Boot order is irrelevant** — every integration degrades gracefully: events retry 3× then drop (a later bootstrap sync converges), write-throughs 502 without mutating, mirror reads keep serving.
- **Rate limiting:** inbound `/events` share DDD's global limiter (`RATE_LIMIT_MAX` per 15 min). Traffic is one event per ERP mutation and one per PEPSI autosave (~700 ms debounce), so `2000/15 min` is comfortable; raise it if bulk backfills or long portal editing sessions ever produce 429s (the 5 s coalescer bounds pulls, not inbound requests).
- The keys travel as plaintext headers — LAN-safe; for public exposure put everything behind an HTTPS reverse proxy first (see `DEPLOYMENT.md` §7).

---

## 19. Rollback

Every system runs 100% standalone — the integrations are strictly additive:

- **Stop a source pushing:** set `INTEGRATION_ENABLED=false` (or clear `DDD_API_URL`/`INTEGRATION_API_KEY`) in the ERP or PEPSI `.env` and restart it. That system keeps working exactly as before; DDD mirrors go stale but nothing breaks.
- **Close DDD's side:** set `ERP_SYNC_ENABLED=false` and/or clear `ERP_INTEGRATION_API_KEY` → inbound ERP events get 503, `/erp` writes fail cleanly (503), mirror reads keep working. Clearing `PEPSI_INTEGRATION_API_KEY` reverts the PEPSI fetcher to the legacy login/snapshot mode.
- **Re-enable:** restore the vars, restart, then `POST /integrations/erp/sync` and `POST /integrations/pepsi/pull` — the idempotent bootstrap converges everything missed while disabled.

---

## 20. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `401 INVALID_API_KEY` / "Invalid API key" | key mismatch between the two `.env` files of that link | make the pair byte-identical (§9 table), restart both sides |
| `503` "Integration API key not configured" / `INTEGRATION_DISABLED` | receiver booted without its key var | set the var in that system's `.env`, restart |
| `502 ERP_UNREACHABLE` / `PEPSI_UNREACHABLE` | source down, wrong `ERP_API_URL`/`PEPSI_API_BASE`, or firewall | check `GET <base>/health` on the source; nothing was mutated — retry after fixing |
| `409 version_conflict` on `PUT /api/state` | another portal session (or a DDD write) saved first | expected — the SPA auto-adopts; custom clients should restore `res.data`, set the returned `version`, and retry from fresh state |
| `409 ERP_MANAGED` | editing an erp-sourced contact via RRRMAS | use the ERP section (`/erp/suppliers` · `/erp/customers`) |
| `409 PEPSI_NO_EXTERNAL_ID` | the pepsi mirror row predates the first sync | `POST /integrations/pepsi/pull`, then retry |
| `409` "PEPSI state not initialised" | fresh PEPSI DB — the blob is seeded by the SPA on first login | open the portal once, then retry |
| `/status` `lastSyncAt` shows never-synced after a DDD restart | it is module-level in-memory, by design (same as HRMS) | run a sync, or trust the per-row `lastSyncedAt` stamps |
| stack traces in error bodies | `NODE_ENV` not set to production | set `NODE_ENV=production` |

---

## 21. Testing checklist

Distilled from the QA runs (all scenarios green as of 22-Jul-2026). Re-run after any integration change:

**ERP track**
- [ ] Bootstrap sync counts match the ERP DB exactly; `/integrations/erp/status` → `erpReachable:true`
- [ ] Create in the ERP UI → DDD mirror appears within ~1 s with `customFields.erp`
- [ ] DDD create/update/delete → visible in the ERP UI; mirror converges from the echo
- [ ] Full production chain from DDD: batch receive → build (RMs `consumed` both sides) → QC pass → sales order → dispatch by barcode (FG `dispatched`, order `completed` both sides)
- [ ] Delete guards: consumed RM / dispatched FG / delivered SO → 400 passthrough, mirrors untouched
- [ ] `GET /erp/track/:code` returns the full passport (RM supplier chain + customer)
- [ ] Wrong key → 401 on both inboxes; ERP UI routes still require JWT
- [ ] ERP killed: writes 502 with zero ghost mirrors, reads still served, clean recovery after restart
- [ ] Dashboard `erp` section equals `/erp/overview` aggregates

**PEPSI track**
- [ ] Pull → `source:'api'`; wire fidelity (health, 1-based currentStage, budgets, NCRs, tests, `expensesExternal`, `blocked`)
- [ ] Portal save → mirror converges in ~5 s (coalesced)
- [ ] DDD PATCH on a pepsi project → portal blob updated, version bump, 'DDD Command Centre' audit entry
- [ ] DDD create + delete of a pepsi project → id/short/stages allocated like the SPA; delete cleans `BUD`/rows/`GATE` keys
- [ ] Contacts: pepsi rows forward by `CUST-`/`OPP-` prefix; erp rows → `409 ERP_MANAGED`
- [ ] Stale versioned PUT → 409 + fresh snapshot; versionless PUT still wins (legacy)
- [ ] Wrong key → 401 everywhere; `/api/state/*` still JWT-only
- [ ] Pepsi killed: write-through 502 with mirror untouched; events still accepted (`{scheduled:true}`); clean recovery
- [ ] PEPSI SPA production bundle retains `apiFetch`/`doLogin`/`boot` (window-attached — tree-shaking guard)

**Regression** — `npm run smoke` / `smoke:tasks` / `smoke:wave1` in `DDD/server` (67/82 green is the current baseline — see §22), combined `client/` build, PEPSI `frontend/` build.

---

## 22. Known assumptions & limitations

- **Versionless PUT stays last-write-wins** — deliberate, for legacy PEPSI SPA compatibility; the optimistic check is opt-in per request.
- **PEPSI in-blob `USERS` vs `AuthUser` drift** — the portal's login accounts (AuthUser collection) and the blob's `USERS` list are separate stores and can drift; the integration reads only the blob.
- **ERP barcodes can be re-minted after a delete** — which is exactly why mirrors key on the immutable Mongo `_id` (§11), never the barcode.
- **PEPSI gates / tasks / docs / risks / stages / milestones / expenses are read-only in DDD** this phase — only the §13 writable set round-trips.
- **ERP uploads are not proxied** — `documentUrl` links point at the ERP host directly.
- **`itsybizz-erp` and `pepsi-src` are NOT git repositories** — those trees (including all their integration code) are unversioned. Ops risk: no history or rollback; keep external backups. (Silver lining: their `.env` keys cannot be committed.)
- **15 of the 82 DDD smoke checks fail by design** — they are stale RBAC-era checks that predate the 22-Jul HRMS phase (roles/permission catalog/employee logins removed); none touch Phase-2 code.
- **`lastSyncAt` is in-memory** (module-level) and resets on a DDD restart — matches the HRMS pattern by design; per-row `lastSyncedAt` stamps persist.
- **No queue/broker** — fire-and-forget + retries + idempotent convergence + bootstrap re-sync IS the delivery guarantee, matching HRMS.

---

## 23. API versioning

- Everything on DDD lives under `/api/v1` (`API_PREFIX`).
- ERP and PEPSI expose unversioned `/api` — documented as-is. A breaking change on either would need new paths (or a version header) coordinated with DDD's clients; none is planned.
