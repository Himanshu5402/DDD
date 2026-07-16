import SupportTicket from '../../models/supportTicket.model.js';
import ApiError from '../../utils/ApiError.js';
import { parsePagination } from '../../utils/pagination.js';

const POPULATE = [
  { path: 'customer', select: 'name company email' },
  { path: 'assignee', select: 'name email avatar' },
  { path: 'createdBy', select: 'name email avatar' },
  { path: 'comments.author', select: 'name email avatar' },
];

const CLOSED_STATUSES = ['resolved', 'closed'];

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Derive sla.breached at read time: past due and not resolved/closed. */
function applySla(ticket) {
  if (!ticket || !ticket.sla) return ticket;
  const dueAt = ticket.sla.dueAt;
  const active = !CLOSED_STATUSES.includes(ticket.status);
  ticket.sla.breached = Boolean(dueAt && active && new Date(dueAt) < new Date());
  return ticket;
}

function buildFilter(query = {}) {
  const filter = {};
  if (query.status) filter.status = query.status;
  if (query.priority) filter.priority = query.priority;
  if (query.customer) filter.customer = query.customer;
  if (query.assignee) filter.assignee = query.assignee;
  if (query.search) {
    const rx = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = [{ subject: rx }, { description: rx }];
  }
  return filter;
}

export async function listTickets(query) {
  const { page, limit, skip, sort } = parsePagination(query, { defaultLimit: 25 });
  const filter = buildFilter(query);

  const [items, total] = await Promise.all([
    SupportTicket.find(filter).populate(POPULATE).sort(sort).skip(skip).limit(limit),
    SupportTicket.countDocuments(filter),
  ]);
  return { items: items.map(applySla), page, limit, total };
}

export async function getTicket(id) {
  const ticket = await SupportTicket.findById(id).populate(POPULATE);
  if (!ticket) throw ApiError.notFound('Support ticket not found');
  return applySla(ticket);
}

export async function createTicket(data, user) {
  const { comment, ...rest } = data;
  const payload = { ...rest, createdBy: user._id };
  if (comment) payload.comments = [{ author: user._id, body: comment }];

  const ticket = await SupportTicket.create(payload);
  return applySla(await SupportTicket.findById(ticket._id).populate(POPULATE));
}

const UPDATABLE = ['subject', 'description', 'customer', 'priority', 'status', 'assignee'];

export async function updateTicket(id, data, user) {
  const ticket = await SupportTicket.findById(id);
  if (!ticket) throw ApiError.notFound('Support ticket not found');

  for (const f of UPDATABLE) if (data[f] !== undefined) ticket[f] = data[f];

  if (data.sla) {
    if (data.sla.dueAt !== undefined) ticket.sla.dueAt = data.sla.dueAt;
    if (data.sla.breached !== undefined) ticket.sla.breached = data.sla.breached;
  }

  if (data.comment) ticket.comments.push({ author: user._id, body: data.comment });

  await ticket.save();
  return applySla(await SupportTicket.findById(ticket._id).populate(POPULATE));
}

export async function deleteTicket(id) {
  const ticket = await SupportTicket.findById(id);
  if (!ticket) throw ApiError.notFound('Support ticket not found');
  await ticket.deleteOne();
  return { success: true };
}
