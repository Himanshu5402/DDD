import asyncHandler from '../../utils/asyncHandler.js';
import ApiResponse from '../../utils/ApiResponse.js';
import { broadcast } from '../../socket/index.js';
import * as service from './contacts.service.js';

/** Notify connected clients that an RRRMAS record changed so they can refetch. */
function emitChange(type, id) {
  broadcast('rrrmas:changed', { type, id: String(id) });
}

export const list = asyncHandler(async (req, res) => {
  const { items, page, limit, total } = await service.listContacts(req.query);
  return ApiResponse.paginated(res, items, { page, limit, total }, 'Contacts');
});

export const getOne = asyncHandler(async (req, res) => {
  const contact = await service.getContact(req.params.id);
  return ApiResponse.ok(res, { contact }, 'Contact');
});

export const create = asyncHandler(async (req, res) => {
  const contact = await service.createContact(req.body, req.user);
  emitChange('contact.created', contact._id);
  return ApiResponse.created(res, { contact }, 'Contact created');
});

export const update = asyncHandler(async (req, res) => {
  const contact = await service.updateContact(req.params.id, req.body);
  emitChange('contact.updated', contact._id);
  return ApiResponse.ok(res, { contact }, 'Contact updated');
});

export const remove = asyncHandler(async (req, res) => {
  await service.deleteContact(req.params.id);
  emitChange('contact.deleted', req.params.id);
  return ApiResponse.ok(res, null, 'Contact deleted');
});
