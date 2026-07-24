import Project, { PEPSI_STAGES } from '../../models/project.model.js';
import Contact from '../../models/contact.model.js';
import User from '../../models/user.model.js';
import logger from '../../config/logger.js';
import { broadcast } from '../../socket/index.js';
import { pingPepsi } from '../../services/integrations/pepsi.client.js';
import { runPepsiSync } from './pepsi.sync.js';

/**
 * PEPSI portal → DDD sync.
 *
 * Accepts projects/customers/leads in the PEPSI wire shape and upserts them
 * keyed on `externalId` (PRJ-xxxx / CUST-xxx / OPP-xxxx), so the sync is
 * idempotent — run it as often as you like, no duplicates. Synced rows get
 * source/sourceSystem='pepsi'; the portal stays the source of truth (DDD
 * writes go through the write-through branches in the rrrmas services).
 *
 * The portal pushes `pepsi.state.updated` after every blob save; a
 * trailing-edge coalesce timer turns bursts of those into ONE pull.
 */

const HEALTH_MAP = {
  'on track': 'on_track',
  on_track: 'on_track',
  'at risk': 'at_risk',
  at_risk: 'at_risk',
  critical: 'critical',
};

function normalizeHealth(value = '') {
  return HEALTH_MAP[String(value).trim().toLowerCase()] ?? '';
}

function toDate(value) {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

// PEPSI stores monetary VALUES (project contract value, opportunity/lead value)
// in LAKHS — the unit users type in the portal (264 means ₹2.64Cr). DDD's
// canonical money unit is rupees (like Finance and manual projects), so value
// fields are scaled up on the way IN and back down on write-through (see
// projects/contacts services). Budget lines and expenses already arrive in
// rupees and are left untouched.
export const LAKH = 100000;
/** PEPSI value (lakhs) → DDD rupees, preserving null/undefined. */
export function lakhToRupees(v) {
  return v == null ? v : Number(v) * LAKH;
}
/** DDD rupees → PEPSI value (lakhs), preserving null/undefined. */
export function rupeesToLakh(v) {
  return v == null ? v : Number(v) / LAKH;
}

/** Map one PEPSI project payload → Project document fields. */
export function mapPepsiProject(p) {
  const stageIndex = p.stageIndex ?? p.currentStage?.index;
  const stageName =
    p.stageName ??
    p.currentStage?.name ??
    (stageIndex ? PEPSI_STAGES[stageIndex - 1] : '');

  const progress = Math.max(0, Math.min(100, Number(p.progress) || 0));

  return {
    source: 'pepsi',
    externalId: String(p.externalId || p.code).trim(),
    code: String(p.code || p.externalId || '').trim(),
    name: p.name,
    description: p.description || '',
    status: progress >= 100 ? 'completed' : 'active',
    workType: p.workType || p.type || '',
    // Lakhs → rupees (portal stores value in lakhs; DDD in rupees).
    contractValue: p.contractValue != null ? lakhToRupees(p.contractValue) : undefined,
    health: normalizeHealth(p.health),
    spi: p.spi != null ? Number(p.spi) : undefined,
    cpi: p.cpi != null ? Number(p.cpi) : undefined,
    currentStage: {
      index: stageIndex != null ? Number(stageIndex) : undefined,
      total: Number(p.stageTotal ?? p.currentStage?.total ?? 8),
      name: stageName || '',
    },
    pmName: p.pmName || p.pm || '',
    customerName: p.customerName || p.customer || '',
    location: p.location || '',
    statusNote: p.statusNote || '',
    insightNote: p.insightNote || p.insight || '',
    startDate: toDate(p.startDate),
    endDate: toDate(p.endDate ?? p.deadline),
    progress,
    milestones: (p.milestones || []).map((m) => ({
      name: m.name,
      date: toDate(m.date),
      status: m.status || 'pending',
    })),
    budgetLines: (p.budgetLines || []).map((b) => ({
      category: b.category,
      budget: Number(b.budget) || 0,
      actual: Number(b.actual) || 0,
    })),
    openItems: {
      ncrs: Number(p.openItems?.ncrs) || 0,
      tasks: Number(p.openItems?.tasks) || 0,
      expenses: Number(p.openItems?.expenses) || 0,
    },
    quotations: (p.quotations || []).map((q) => ({
      externalId: q.externalId || q.id || '',
      title: q.title || q.name,
      stage: q.stage || '',
      estValue: q.estValue != null ? lakhToRupees(q.estValue) : undefined,
      probability: q.probability != null ? Number(q.probability) : undefined,
      closeDate: toDate(q.closeDate),
      owner: q.owner || '',
    })),
    risksExternal: (p.risks || p.risksExternal || []).map((r) => ({
      probability: r.probability || '',
      impact: r.impact || '',
      description: r.description,
    })),
    teamExternal: (p.team || p.teamExternal || []).map((t) => ({
      name: t.name,
      role: t.role || '',
      utilization: t.utilization != null ? Number(t.utilization) : undefined,
    })),
    stages: (p.stages || []).map((s) => ({
      name: s.name,
      status: s.status || '',
      progress: Math.max(0, Math.min(100, Number(s.progress) || 0)),
    })),
    ncrs: (p.ncrs || []).map((n) => ({
      externalId: n.externalId || n.id || '',
      severity: n.severity || n.sev || '',
      status: n.status || n.st || '',
      ageDays: Number(n.ageDays ?? n.age) || 0,
      title: n.title,
      owner: n.owner || '',
      correctiveAction: n.correctiveAction || n.ca || '',
    })),
    tests: (p.tests || []).map((t) => ({
      externalId: t.externalId || t.id || '',
      name: t.name,
      type: t.type || '',
      status: t.status || '',
      window: t.window || t.win || '',
      metrics: (t.metrics || t.m || []).map((m) =>
        Array.isArray(m)
          ? { name: m[0], target: m[1], actual: m[2], pass: !!m[3] }
          : { name: m.name, target: m.target, actual: m.actual, pass: !!m.pass }
      ),
    })),
    changeRequests: (p.changeRequests || []).map((c) => ({
      externalId: c.externalId || c.id || '',
      scope: c.scope,
      cost: c.cost || '',
      schedule: c.schedule || c.sch || '',
      status: c.status || c.st || '',
    })),
    expensesExternal: (p.expenses || p.expensesExternal || []).map((e) => ({
      externalId: e.externalId || e.id || '',
      category: e.category || e.cat || '',
      amount: e.amount != null || e.amt != null ? Number(e.amount ?? e.amt) || 0 : 0,
      by: e.by || '',
      date: e.date || e.dt || '', // portal-formatted, e.g. "03 Jul" — kept verbatim
      status: e.status || e.st || '',
      paid: e.paid || '',
      note: e.note || '',
      rejectReason: e.rejectReason || e.rej || '',
    })),
    blocked: !!p.blocked,
    lastSyncedAt: new Date(),
  };
}

/**
 * Upsert a batch of PEPSI projects. Returns { created, updated, total }.
 * @param {Array} projects PEPSI wire-shape payloads
 * @param {string} actorId User id recorded as createdBy on first insert
 */
export async function upsertPepsiProjects(projects, actorId) {
  let created = 0;
  let updated = 0;

  for (const raw of projects) {
    if (!raw?.externalId && !raw?.code) continue;
    if (!raw?.name) continue;

    const mapped = mapPepsiProject(raw);
    const existing = await Project.findOne({ externalId: mapped.externalId });

    if (existing) {
      Object.assign(existing, mapped);
      await existing.save();
      updated += 1;
    } else {
      await Project.create({ ...mapped, createdBy: actorId });
      created += 1;
    }
  }

  return { created, updated, total: created + updated };
}

let systemUserIdCache = null;
/**
 * The DDD user mirrored rows are attributed to (createdBy): the seed admin —
 * earliest active non-HRMS account (same pattern as hrmsSync.service.js).
 */
async function getSystemUserId() {
  if (systemUserIdCache) return systemUserIdCache;
  const admin =
    (await User.findOne({ isActive: true, source: { $ne: 'hrms' } })
      .sort({ createdAt: 1 })
      .select('_id')) || (await User.findOne().sort({ createdAt: 1 }).select('_id'));
  systemUserIdCache = admin?._id ?? null;
  return systemUserIdCache;
}

/* ===================== Customer / lead Contact mirrors ===================== */

// PEPSI sales stage → DDD contact status (leads only; customers stay 'active').
const LEAD_STATUS_MAP = {
  Lead: 'new',
  Qualified: 'qualified',
  Proposal: 'contacted',
  Negotiation: 'contacted',
  Won: 'active',
  Lost: 'lost',
};

/**
 * Upsert PEPSI customers as Contact mirrors keyed `{externalId (CUST-xxx),
 * sourceSystem:'pepsi'}`. Portal fields live under `customFields.pepsi`.
 * Returns { created, updated, total }.
 */
export async function upsertPepsiCustomers(customers = [], actorId) {
  let created = 0;
  let updated = 0;

  for (const c of customers) {
    const externalId = String(c?.externalId || c?.id || '').trim();
    if (!externalId || !c?.name) continue;

    const pepsi = {
      industry: c.industry || '',
      site: c.site || '',
      contractValue: c.contractValue != null ? lakhToRupees(c.contractValue) : null,
      portalStatus: c.status || '',
    };

    const existing = await Contact.findOne({ externalId });
    if (existing) {
      existing.sourceSystem = 'pepsi';
      existing.type = 'customer';
      existing.name = c.name;
      existing.status = 'active';
      existing.customFields = { ...(existing.customFields || {}), pepsi };
      await existing.save();
      updated += 1;
    } else {
      await Contact.create({
        name: c.name,
        type: 'customer',
        status: 'active',
        sourceSystem: 'pepsi',
        externalId,
        customFields: { pepsi },
        createdBy: actorId || (await getSystemUserId()),
      });
      created += 1;
    }
  }

  return { created, updated, total: created + updated };
}

/**
 * Upsert PEPSI sales leads (OPP-xxxx) as Contact mirrors, type 'lead'.
 * `company` = prospect name, falling back to the linked customer's name.
 * Returns { created, updated, total }.
 */
export async function upsertPepsiLeads(leads = [], actorId) {
  let created = 0;
  let updated = 0;

  for (const l of leads) {
    const externalId = String(l?.externalId || l?.id || '').trim();
    const name = l?.title || l?.name;
    if (!externalId || !name) continue;

    let company = l.prospect || '';
    if (!company && l.customerExternalId) {
      const customer = await Contact.findOne({ externalId: l.customerExternalId }).select('name');
      company = customer?.name || '';
    }

    const pepsi = {
      stage: l.stage || '',
      value: l.value != null ? lakhToRupees(l.value) : null,
      probability: l.probability != null ? Number(l.probability) : null,
      owner: l.owner || '',
      source: l.source || '',
      closeDate: l.closeDate || '',
      nextAction: l.nextAction || '',
      note: l.note || '',
      customerExternalId: l.customerExternalId || '',
    };

    const fields = {
      sourceSystem: 'pepsi',
      type: 'lead',
      name,
      company,
      status: LEAD_STATUS_MAP[l.stage] || 'new',
    };

    const existing = await Contact.findOne({ externalId });
    if (existing) {
      Object.assign(existing, fields);
      existing.customFields = { ...(existing.customFields || {}), pepsi };
      await existing.save();
      updated += 1;
    } else {
      await Contact.create({
        ...fields,
        externalId,
        customFields: { pepsi },
        createdBy: actorId || (await getSystemUserId()),
      });
      created += 1;
    }
  }

  return { created, updated, total: created + updated };
}

/* ========================= Inbound event handling ========================= */

const EVENT_SYNC_COALESCE_MS = 5000;
let eventSyncTimer = null;

/**
 * Handle a pushed PEPSI event. The portal emits `pepsi.state.updated` after
 * every blob save (SPA autosaves ~700ms after each change), so instead of
 * pulling per event we coalesce: each event re-arms a 5s trailing-edge timer
 * and ONE full pull runs after the burst settles. Unknown events → ignored.
 */
export function handlePepsiEvent(event, _payload = {}) {
  if (event !== 'pepsi.state.updated') return { ignored: true, event };

  if (eventSyncTimer) clearTimeout(eventSyncTimer);
  eventSyncTimer = setTimeout(async () => {
    eventSyncTimer = null;
    try {
      const actorId = await getSystemUserId();
      // No snapshot fallback here: the event proves the API is up, and a
      // stale snapshot must never overwrite freshly-pushed portal state.
      const result = await runPepsiSync(actorId, { allowSnapshotFallback: false });
      broadcast('rrrmas:changed', { type: 'pepsi:event-sync', at: Date.now() });
      logger.info(`PEPSI event sync complete: ${JSON.stringify(result)}`);
    } catch (err) {
      logger.error(`PEPSI event sync failed: ${err.message}`);
    }
  }, EVENT_SYNC_COALESCE_MS);
  eventSyncTimer.unref?.();

  return { event, handled: true, scheduled: true };
}

/** Sync status: mirror counts, reachability, and when they last synced. */
export async function getPepsiStatus() {
  const [count, latest, customers, leads, pepsiReachable] = await Promise.all([
    Project.countDocuments({ source: 'pepsi' }),
    Project.findOne({ source: 'pepsi' }).sort({ lastSyncedAt: -1 }).select('lastSyncedAt'),
    Contact.countDocuments({ sourceSystem: 'pepsi', type: 'customer' }),
    Contact.countDocuments({ sourceSystem: 'pepsi', type: 'lead' }),
    pingPepsi(),
  ]);
  return {
    projects: count,
    customers,
    leads,
    pepsiReachable,
    lastSyncedAt: latest?.lastSyncedAt ?? null,
  };
}
