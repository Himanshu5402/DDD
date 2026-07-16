import Project from '../../models/project.model.js';
import ApiError from '../../utils/ApiError.js';
import { parsePagination } from '../../utils/pagination.js';
import { validateValues as validateCustomFields } from '../customFields/customFields.service.js';

const ENTITY = 'project';

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

  for (const f of UPDATABLE) if (data[f] !== undefined) project[f] = data[f];

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
  await project.deleteOne();
  return { success: true };
}
