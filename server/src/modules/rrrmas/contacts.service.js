import Contact from '../../models/contact.model.js';
import ApiError from '../../utils/ApiError.js';
import { parsePagination } from '../../utils/pagination.js';
import { validateValues as validateCustomFields } from '../customFields/customFields.service.js';

const ENTITY = 'contact';

const POPULATE = [
  { path: 'owner', select: 'name email avatar' },
  { path: 'createdBy', select: 'name email avatar' },
];

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildFilter(query = {}) {
  const filter = {};
  if (query.type) filter.type = query.type;
  if (query.status) filter.status = query.status;
  if (query.owner) filter.owner = query.owner;
  if (query.tag) filter.tags = query.tag;
  if (query.search) {
    const rx = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = [{ name: rx }, { company: rx }, { email: rx }];
  }
  return filter;
}

export async function listContacts(query) {
  const { page, limit, skip, sort } = parsePagination(query, { defaultLimit: 25 });
  const filter = buildFilter(query);

  const [items, total] = await Promise.all([
    Contact.find(filter).populate(POPULATE).sort(sort).skip(skip).limit(limit),
    Contact.countDocuments(filter),
  ]);
  return { items, page, limit, total };
}

export async function getContact(id) {
  const contact = await Contact.findById(id).populate(POPULATE);
  if (!contact) throw ApiError.notFound('Contact not found');
  return contact;
}

export async function createContact(data, user) {
  const customFields = data.customFields
    ? await validateCustomFields(ENTITY, data.customFields)
    : {};

  const contact = await Contact.create({ ...data, customFields, createdBy: user._id });
  return Contact.findById(contact._id).populate(POPULATE);
}

const UPDATABLE = ['name', 'type', 'company', 'email', 'phone', 'status', 'source', 'owner', 'tags', 'notes'];

export async function updateContact(id, data) {
  const contact = await Contact.findById(id);
  if (!contact) throw ApiError.notFound('Contact not found');

  for (const f of UPDATABLE) if (data[f] !== undefined) contact[f] = data[f];

  if (data.customFields !== undefined) {
    const merged = { ...contact.customFields, ...data.customFields };
    contact.customFields = await validateCustomFields(ENTITY, merged, { partial: true });
  }

  await contact.save();
  return Contact.findById(contact._id).populate(POPULATE);
}

export async function deleteContact(id) {
  const contact = await Contact.findById(id);
  if (!contact) throw ApiError.notFound('Contact not found');
  await contact.deleteOne();
  return { success: true };
}
