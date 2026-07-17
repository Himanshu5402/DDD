import Project, { PEPSI_STAGES } from '../../models/project.model.js';

/**
 * PEPSI portal → DDD project sync.
 *
 * Accepts projects in the PEPSI wire shape and upserts them keyed on
 * `externalId` (PRJ-xxxx), so the sync is idempotent — run it as often as
 * you like, no duplicates. Synced projects get source='pepsi' and are meant
 * to be read-only in DDD (PEPSI stays the source of truth).
 *
 * When the PEPSI API exists, point a fetcher at it and pass its JSON here —
 * nothing else in DDD needs to change.
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
    contractValue: p.contractValue != null ? Number(p.contractValue) : undefined,
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
      estValue: q.estValue != null ? Number(q.estValue) : undefined,
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

/** Sync status: how many PEPSI projects exist and when they last synced. */
export async function getPepsiStatus() {
  const [count, latest] = await Promise.all([
    Project.countDocuments({ source: 'pepsi' }),
    Project.findOne({ source: 'pepsi' }).sort({ lastSyncedAt: -1 }).select('lastSyncedAt'),
  ]);
  return { projects: count, lastSyncedAt: latest?.lastSyncedAt ?? null };
}
