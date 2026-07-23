import Project from '../../models/project.model.js';
import ApiError from '../../utils/ApiError.js';
import { parsePagination } from '../../utils/pagination.js';
import { validateValues as validateCustomFields } from '../customFields/customFields.service.js';
import { pepsiPost, pepsiPut, pepsiDelete } from '../../services/integrations/pepsi.client.js';
import { mapPepsiProject } from '../integrations/pepsi.service.js';

const ENTITY = 'project';

/* ------------------ PEPSI write-through (source==='pepsi') ------------------
 * The portal owns pepsi-sourced projects, so owner edits forward to
 * `{PEPSI_API_BASE}/integration/*` FIRST — on failure the ApiError propagates
 * and nothing mutates locally. Only this field set is writable from DDD
 * (contract §3.3); stages/milestones/gates/tests/NCRs/expenses stay
 * portal-owned and read-only here.
 */
const PEPSI_WRITABLE = [
  'name', 'location', 'workType', 'contractValue', 'pmName',
  'startDate', 'endDate', 'statusNote', 'health', 'blocked',
];

// DDD health enum → portal blob code (reverse of the sync-side HEALTH_MAP).
const PEPSI_HEALTH_REVERSE = { on_track: 'gn', at_risk: 'am', critical: 'rd' };

function toYmd(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Provided-only writable subset of `data` → PEPSI wire body. */
function toPepsiWireBody(data) {
  const body = {};
  for (const f of PEPSI_WRITABLE) {
    if (data[f] === undefined) continue;
    if (f === 'startDate' || f === 'endDate') body[f] = data[f] ? toYmd(data[f]) : '';
    else if (f === 'health') body.health = PEPSI_HEALTH_REVERSE[data.health] ?? '';
    else body[f] = data[f];
  }
  return body;
}

/** Unwrap a PEPSI response and re-map the returned wire project, if present. */
function wireProjectFrom(response) {
  const wire = response?.data ?? response;
  return wire && (wire.externalId || wire.code) ? mapPepsiProject(wire) : null;
}

const POPULATE = [
  { path: 'customer', select: 'name company email' },
  { path: 'manager', select: 'name email avatar' },
  { path: 'team', select: 'name email avatar' },
  { path: 'createdBy', select: 'name email avatar' },
];

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildFilter(query = {}) {
  const filter = {};
  if (query.status) filter.status = query.status;
  if (query.customer) filter.customer = query.customer;
  if (query.manager) filter.manager = query.manager;
  if (query.tag) filter.tags = query.tag;
  if (query.search) {
    const rx = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = [{ name: rx }, { description: rx }];
  }
  return filter;
}

export async function listProjects(query) {
  const { page, limit, skip, sort } = parsePagination(query, { defaultLimit: 25 });
  const filter = buildFilter(query);

  const [items, total] = await Promise.all([
    Project.find(filter).populate(POPULATE).sort(sort).skip(skip).limit(limit),
    Project.countDocuments(filter),
  ]);
  return { items, page, limit, total };
}

export async function getProject(id) {
  const project = await Project.findById(id).populate(POPULATE);
  if (!project) throw ApiError.notFound('Project not found');
  return project;
}

export async function createProject(data, user) {
  const customFields = data.customFields
    ? await validateCustomFields(ENTITY, data.customFields)
    : {};

  // Pepsi-targeted create: the portal allocates the id (PRJ-xxxx) and owns the
  // record — create there first, then mirror its wire response.
  if (data.source === 'pepsi') {
    const body = { name: data.name };
    if (data.customerExternalId !== undefined) body.customerExternalId = data.customerExternalId;
    for (const f of ['location', 'workType', 'contractValue', 'pmName', 'statusNote']) {
      if (data[f] !== undefined) body[f] = data[f];
    }
    if (data.startDate !== undefined) body.startDate = data.startDate ? toYmd(data.startDate) : '';
    if (data.endDate !== undefined) body.endDate = data.endDate ? toYmd(data.endDate) : '';

    const response = await pepsiPost('/integration/projects', body);
    const mapped = wireProjectFrom(response);
    if (!mapped) {
      throw new ApiError(502, 'PEPSI did not return the created project', { code: 'PEPSI_ERROR' });
    }

    // DDD-owned fields (refs/tags/notes) live locally only.
    const local = {};
    for (const f of ['description', 'customer', 'manager', 'team', 'tags', 'budget']) {
      if (data[f] !== undefined) local[f] = data[f];
    }
    const project = await Project.create({ ...mapped, ...local, customFields, createdBy: user._id });
    return Project.findById(project._id).populate(POPULATE);
  }

  const project = await Project.create({ ...data, customFields, createdBy: user._id });
  return Project.findById(project._id).populate(POPULATE);
}

const UPDATABLE = [
  'name', 'description', 'customer', 'status', 'startDate', 'endDate',
  'budget', 'manager', 'team', 'progress', 'tags',
];

export async function updateProject(id, data) {
  const project = await Project.findById(id);
  if (!project) throw ApiError.notFound('Project not found');

  if (project.source === 'pepsi') {
    const wireBody = toPepsiWireBody(data);
    if (Object.keys(wireBody).length) {
      if (!project.externalId) {
        throw ApiError.conflict('PEPSI project has no external reference — run a sync first', {
          code: 'PEPSI_NO_EXTERNAL_ID',
        });
      }
      // Forward FIRST; on failure nothing mutates locally. On success the
      // mirror refreshes from the portal's echo of the whole wire project.
      const response = await pepsiPut(`/integration/projects/${project.externalId}`, wireBody);
      const mapped = wireProjectFrom(response);
      if (mapped) Object.assign(project, mapped);
    }
    // DDD-owned fields update locally only (portal never sees them).
    for (const f of UPDATABLE) {
      if (!PEPSI_WRITABLE.includes(f) && data[f] !== undefined) project[f] = data[f];
    }
  } else {
    for (const f of UPDATABLE) if (data[f] !== undefined) project[f] = data[f];
  }

  if (data.customFields !== undefined) {
    const merged = { ...project.customFields, ...data.customFields };
    project.customFields = await validateCustomFields(ENTITY, merged, { partial: true });
  }

  await project.save();
  return Project.findById(project._id).populate(POPULATE);
}

export async function deleteProject(id) {
  const project = await Project.findById(id);
  if (!project) throw ApiError.notFound('Project not found');

  // Pepsi-sourced: delete in the portal first — if that fails, the local
  // mirror stays (it would only resurrect on the next sync anyway).
  if (project.source === 'pepsi') {
    if (!project.externalId) {
      throw ApiError.conflict('PEPSI project has no external reference — run a sync first', {
        code: 'PEPSI_NO_EXTERNAL_ID',
      });
    }
    await pepsiDelete(`/integration/projects/${project.externalId}`);
  }

  await project.deleteOne();
  return { success: true };
}
