import asyncHandler from '../../utils/asyncHandler.js';
import ApiResponse from '../../utils/ApiResponse.js';
import { broadcast } from '../../socket/index.js';
import * as service from './tickets.service.js';

/** Notify connected clients that an RRRMAS record changed so they can refetch. */
function emitChange(type, id) {
  broadcast('rrrmas:changed', { type, id: String(id) });
}

export const list = asyncHandler(async (req, res) => {
  const { items, page, limit, total } = await service.listTickets(req.query);
  return ApiResponse.paginated(res, items, { page, limit, total }, 'Support tickets');
});

export const getOne = asyncHandler(async (req, res) => {
  const ticket = await service.getTicket(req.params.id);
  return ApiResponse.ok(res, { ticket }, 'Support ticket');
});

export const create = asyncHandler(async (req, res) => {
  const ticket = await service.createTicket(req.body, req.user);
  emitChange('ticket.created', ticket._id);
  return ApiResponse.created(res, { ticket }, 'Support ticket created');
});

export const update = asyncHandler(async (req, res) => {
  const ticket = await service.updateTicket(req.params.id, req.body, req.user);
  emitChange('ticket.updated', ticket._id);
  return ApiResponse.ok(res, { ticket }, 'Support ticket updated');
});

export const remove = asyncHandler(async (req, res) => {
  await service.deleteTicket(req.params.id);
  emitChange('ticket.deleted', req.params.id);
  return ApiResponse.ok(res, null, 'Support ticket deleted');
});
