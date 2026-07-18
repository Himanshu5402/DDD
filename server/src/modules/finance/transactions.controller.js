import asyncHandler from '../../utils/asyncHandler.js';
import ApiResponse from '../../utils/ApiResponse.js';
import { broadcast } from '../../socket/index.js';
import * as service from './transactions.service.js';

/** Notify connected clients that finance data changed so they can refetch. */
function emitChange(type, id) {
  broadcast('finance:changed', { type, id: String(id), at: Date.now() });
}

export const list = asyncHandler(async (req, res) => {
  const { items, page, limit, total } = await service.listTransactions(req.query);
  return ApiResponse.paginated(res, items, { page, limit, total }, 'Transactions');
});

export const getOne = asyncHandler(async (req, res) => {
  const transaction = await service.getTransaction(req.params.id);
  return ApiResponse.ok(res, { transaction }, 'Transaction');
});

export const create = asyncHandler(async (req, res) => {
  const transaction = await service.createTransaction(req.body, req.user);
  emitChange('transaction:created', transaction._id);
  return ApiResponse.created(res, { transaction }, 'Transaction created');
});

export const update = asyncHandler(async (req, res) => {
  const transaction = await service.updateTransaction(req.params.id, req.body);
  emitChange('transaction:updated', transaction._id);
  return ApiResponse.ok(res, { transaction }, 'Transaction updated');
});

export const remove = asyncHandler(async (req, res) => {
  await service.deleteTransaction(req.params.id);
  emitChange('transaction:deleted', req.params.id);
  return ApiResponse.ok(res, null, 'Transaction deleted');
});

export const customMethods = asyncHandler(async (req, res) => {
  const methods = await service.listCustomPaymentMethods();
  return ApiResponse.ok(res, { methods }, 'Custom payment methods');
});

export const summary = asyncHandler(async (req, res) => {
  const data = await service.getSummary(req.query);
  return ApiResponse.ok(res, data, 'Finance summary');
});

export const aiInsights = asyncHandler(async (req, res) => {
  const result = await service.aiInsights(req.body);
  return ApiResponse.ok(res, result, 'AI insights');
});
