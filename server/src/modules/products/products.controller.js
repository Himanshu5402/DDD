import asyncHandler from '../../utils/asyncHandler.js';
import ApiResponse from '../../utils/ApiResponse.js';
import { broadcast } from '../../socket/index.js';
import * as service from './products.service.js';

/** Notify connected clients that the product catalog changed so they can refetch. */
function emitChange(type, productId) {
  broadcast('products:changed', { type, id: String(productId), at: Date.now() });
}

export const list = asyncHandler(async (req, res) => {
  const { items, page, limit, total } = await service.listProducts(req.query);
  return ApiResponse.paginated(res, items, { page, limit, total }, 'Products');
});

export const getOne = asyncHandler(async (req, res) => {
  const product = await service.getProduct(req.params.id);
  return ApiResponse.ok(res, { product }, 'Product');
});

export const create = asyncHandler(async (req, res) => {
  const product = await service.createProduct(req.body, req.user);
  emitChange('created', product._id);
  return ApiResponse.created(res, { product }, 'Product created');
});

export const update = asyncHandler(async (req, res) => {
  const product = await service.updateProduct(req.params.id, req.body);
  emitChange('updated', product._id);
  return ApiResponse.ok(res, { product }, 'Product updated');
});

export const addVersion = asyncHandler(async (req, res) => {
  const product = await service.addVersion(req.params.id, req.body);
  emitChange('updated', product._id);
  return ApiResponse.ok(res, { product }, 'Version released');
});

export const addRoadmapItem = asyncHandler(async (req, res) => {
  const product = await service.addRoadmapItem(req.params.id, req.body);
  emitChange('updated', product._id);
  return ApiResponse.created(res, { product }, 'Roadmap item added');
});

export const updateRoadmapItem = asyncHandler(async (req, res) => {
  const product = await service.updateRoadmapItem(req.params.id, req.params.itemId, req.body);
  emitChange('updated', product._id);
  return ApiResponse.ok(res, { product }, 'Roadmap item updated');
});

export const remove = asyncHandler(async (req, res) => {
  await service.deleteProduct(req.params.id);
  emitChange('deleted', req.params.id);
  return ApiResponse.ok(res, null, 'Product deleted');
});
