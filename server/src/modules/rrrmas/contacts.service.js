import Contact from '../../models/contact.model.js';
import Project from '../../models/project.model.js';
import Renewal from '../../models/renewal.model.js';
import SupportTicket from '../../models/supportTicket.model.js';
import Transaction from '../../models/transaction.model.js';
import ApiError from '../../utils/ApiError.js';
import { parsePagination } from '../../utils/pagination.js';
import { validateValues as validateCustomFields } from '../customFields/customFields.service.js';
import { pepsiPut, pepsiDelete } from '../../services/integrations/pepsi.client.js';
import { upsertPepsiCustomers, upsertPepsiLeads } from '../integrations/pepsi.service.js';

const ENTITY = 'contact';

/* ---------------- Integration-sourced contacts (sourceSystem) ----------------
 * ERP rows are managed exclusively through the ERP section (409 here).
 * PEPSI rows write through to the portal FIRST (customers CUST-xxx, leads
 * OPP-xxxx by externalId prefix); on failure nothing mutates locally.
 */

// DDD contact status → portal sales stage (best-effort reverse of the sync map).
const PEPSI_STAGE_REVERSE = {
  new: 'Lead',
  qualified: 'Qualified',
  contacted: 'Proposal',
  active: 'Won',
  lost: 'Lost',
};

function erpManaged() {
  return new ApiError(409, 'Managed by ERP — use the ERP section', { code: 'ERP_MANAGED' });
}

function requirePepsiExternalId(contact) {
  if (!contact.externalId) {
    throw ApiError.conflict('PEPSI contact has no external reference — run a sync first', {
      code: 'PEPSI_NO_EXTERNAL_ID',
    });
  }
  return contact.externalId;
}

/** Forward a pepsi-sourced contact update; returns the portal's wire row (or null). */
async function forwardPepsiContactUpdate(contact, data) {
  const externalId = requirePepsiExternalId(contact);
  const pepsiCf = data.customFields?.pepsi || {};
  let response;

  if (externalId.startsWith('CUST-')) {
    const body = {};
    if (data.name !== undefined) body.name = data.name;
    for (const f of ['industry', 'site', 'contractValue']) {
      if (pepsiCf[f] !== undefined) body[f] = pepsiCf[f];
    }
    // Portal status lives in customFields.pepsi.portalStatus; DDD's own
    // status enum doesn't map onto it, so omit unless we know it.
    const portalStatus = pepsiCf.portalStatus ?? contact.customFields?.pepsi?.portalStatus;
    if (portalStatus) body.status = portalStatus;
    response = await pepsiPut(`/integration/customers/${externalId}`, body);
  } else if (externalId.startsWith('OPP-')) {
    const body = {};
    if (data.name !== undefined) body.title = data.name;
    if (data.company !== undefined) body.prospect = data.company;
    const stage = pepsiCf.stage ?? PEPSI_STAGE_REVERSE[data.status];
    if (data.status !== undefined || pepsiCf.stage !== undefined) {
      if (stage) body.stage = stage;
    }
    for (const f of ['value', 'probability', 'owner', 'source', 'closeDate', 'nextAction', 'note', 'customerExternalId']) {
      if (pepsiCf[f] !== undefined) body[f] = pepsiCf[f];
    }
    response = await pepsiPut(`/integration/leads/${externalId}`, body);
  } else {
    return null; // unrecognized id-space — treat as local-only
  }

  const wire = response?.data ?? response;
  return wire && (wire.externalId || wire.id) ? wire : null;
}

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
  let contact = await Contact.findById(id);
  if (!contact) throw ApiError.notFound('Contact not found');

  if (contact.sourceSystem === 'erp') throw erpManaged();

  if (contact.sourceSystem === 'pepsi') {
    // Write through to the portal FIRST; failure propagates, nothing saved.
    const wire = await forwardPepsiContactUpdate(contact, data);
    if (wire) {
      // Converge the mirror from the portal's echo before layering local fields.
      if (contact.externalId.startsWith('CUST-')) await upsertPepsiCustomers([wire]);
      else await upsertPepsiLeads([wire]);
      contact = await Contact.findById(id);
    }
  }

  for (const f of UPDATABLE) if (data[f] !== undefined) contact[f] = data[f];

  if (data.customFields !== undefined) {
    const merged = { ...contact.customFields, ...data.customFields };
    const validated = await validateCustomFields(ENTITY, merged, { partial: true });
    // validateCustomFields keeps only admin-defined keys — re-attach the
    // integration blob so a user PATCH can never wipe the pepsi mirror data.
    const pepsi = merged.pepsi ?? contact.customFields?.pepsi;
    contact.customFields = pepsi !== undefined ? { ...validated, pepsi } : validated;
  }

  await contact.save();
  return Contact.findById(contact._id).populate(POPULATE);
}

export async function deleteContact(id) {
  const contact = await Contact.findById(id);
  if (!contact) throw ApiError.notFound('Contact not found');

  if (contact.sourceSystem === 'erp') throw erpManaged();

  // Block deletion while the contact is still referenced elsewhere, so we never
  // strand dangling ObjectIds across projects / renewals / tickets / finance.
  const [projects, renewals, tickets, transactions] = await Promise.all([
    Project.countDocuments({ customer: id }),
    Renewal.countDocuments({ customer: id }),
    SupportTicket.countDocuments({ customer: id }),
    Transaction.countDocuments({ 'party.contact': id }),
  ]);

  const refs = [];
  if (projects) refs.push(`${projects} project(s)`);
  if (renewals) refs.push(`${renewals} renewal(s)`);
  if (tickets) refs.push(`${tickets} support ticket(s)`);
  if (transactions) refs.push(`${transactions} transaction(s)`);
  if (refs.length) {
    throw ApiError.badRequest(
      `Cannot delete: contact is referenced by ${refs.join(', ')}. Reassign or remove those first.`
    );
  }

  // Pepsi-sourced: delete in the portal first (its own 409 — e.g. "Customer
  // has projects" — passes through); only then drop the local mirror.
  if (contact.sourceSystem === 'pepsi') {
    const externalId = requirePepsiExternalId(contact);
    if (externalId.startsWith('CUST-')) await pepsiDelete(`/integration/customers/${externalId}`);
    else if (externalId.startsWith('OPP-')) await pepsiDelete(`/integration/leads/${externalId}`);
  }

  await contact.deleteOne();
  return { success: true };
}
