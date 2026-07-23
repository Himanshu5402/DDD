import asyncHandler from '../../utils/asyncHandler.js';
import ApiResponse from '../../utils/ApiResponse.js';
import { broadcast } from '../../socket/index.js';
import * as service from './erp.service.js';

/** Notify connected clients that ERP mirror data changed so they can refetch. */
function emitChange(type) {
  broadcast('erp:changed', { type: `erp:${type}`, at: Date.now() });
}

/* ------------------------------- overview ------------------------------- */

export const overview = asyncHandler(async (_req, res) => {
  const result = await service.getOverview();
  return ApiResponse.ok(res, result, 'ERP overview');
});

export const track = asyncHandler(async (req, res) => {
  const result = await service.trackCode(req.params.code);
  return ApiResponse.ok(res, result, 'Traceability');
});

/* ------------------------------- suppliers ------------------------------ */

export const listSuppliers = asyncHandler(async (req, res) => {
  const { items, page, limit, total } = await service.listSuppliers(req.query);
  return ApiResponse.paginated(res, items, { page, limit, total }, 'ERP suppliers');
});

export const createSupplier = asyncHandler(async (req, res) => {
  const supplier = await service.createSupplier(req.body);
  emitChange('supplier.created');
  return ApiResponse.created(res, { supplier }, 'Supplier created');
});

export const updateSupplier = asyncHandler(async (req, res) => {
  const supplier = await service.updateSupplier(req.params.externalId, req.body);
  emitChange('supplier.updated');
  return ApiResponse.ok(res, { supplier }, 'Supplier updated');
});

export const removeSupplier = asyncHandler(async (req, res) => {
  await service.deleteSupplier(req.params.externalId);
  emitChange('supplier.deleted');
  return ApiResponse.ok(res, null, 'Supplier deleted');
});

/* ------------------------------- customers ------------------------------ */

export const listCustomers = asyncHandler(async (req, res) => {
  const { items, page, limit, total } = await service.listCustomers(req.query);
  return ApiResponse.paginated(res, items, { page, limit, total }, 'ERP customers');
});

export const createCustomer = asyncHandler(async (req, res) => {
  const customer = await service.createCustomer(req.body);
  emitChange('customer.created');
  return ApiResponse.created(res, { customer }, 'Customer created');
});

export const updateCustomer = asyncHandler(async (req, res) => {
  const customer = await service.updateCustomer(req.params.externalId, req.body);
  emitChange('customer.updated');
  return ApiResponse.ok(res, { customer }, 'Customer updated');
});

export const removeCustomer = asyncHandler(async (req, res) => {
  await service.deleteCustomer(req.params.externalId);
  emitChange('customer.deleted');
  return ApiResponse.ok(res, null, 'Customer deleted');
});

/* ----------------------------- raw materials ---------------------------- */

export const listRawMaterials = asyncHandler(async (req, res) => {
  const { items, page, limit, total } = await service.listRawMaterials(req.query);
  return ApiResponse.paginated(res, items, { page, limit, total }, 'ERP raw materials');
});

export const receiveRawMaterials = asyncHandler(async (req, res) => {
  const result = await service.receiveRawMaterials(req.body);
  emitChange('rawmaterial.received');
  return ApiResponse.created(res, result, `Received ${result.count} unit(s)`);
});

export const updateRawMaterial = asyncHandler(async (req, res) => {
  const rawMaterial = await service.updateRawMaterial(req.params.externalId, req.body);
  emitChange('rawmaterial.updated');
  return ApiResponse.ok(res, { rawMaterial }, 'Raw material updated');
});

export const removeRawMaterial = asyncHandler(async (req, res) => {
  await service.deleteRawMaterial(req.params.externalId);
  emitChange('rawmaterial.deleted');
  return ApiResponse.ok(res, null, 'Raw material deleted');
});

/* ---------------------------- finished goods ---------------------------- */

export const listFinishedGoods = asyncHandler(async (req, res) => {
  const { items, page, limit, total } = await service.listFinishedGoods(req.query);
  return ApiResponse.paginated(res, items, { page, limit, total }, 'ERP finished goods');
});

export const buildFinishedGood = asyncHandler(async (req, res) => {
  const finishedGood = await service.buildFinishedGood(req.body);
  emitChange('finishedgood.built');
  return ApiResponse.created(res, { finishedGood }, 'Finished good built');
});

export const submitQc = asyncHandler(async (req, res) => {
  const finishedGood = await service.submitQc(req.params.externalId, req.body);
  emitChange('finishedgood.qc');
  return ApiResponse.ok(res, { finishedGood }, 'QC submitted');
});

export const removeFinishedGood = asyncHandler(async (req, res) => {
  await service.deleteFinishedGood(req.params.externalId);
  emitChange('finishedgood.deleted');
  return ApiResponse.ok(res, null, 'Finished good deleted');
});

/* --------------------------------- BOMs --------------------------------- */

export const listBoms = asyncHandler(async (req, res) => {
  const { items, page, limit, total } = await service.listBoms(req.query);
  return ApiResponse.paginated(res, items, { page, limit, total }, 'ERP BOMs');
});

export const createBom = asyncHandler(async (req, res) => {
  const bom = await service.createBom(req.body);
  emitChange('bom.created');
  return ApiResponse.created(res, { bom }, 'BOM created');
});

export const updateBom = asyncHandler(async (req, res) => {
  const bom = await service.updateBom(req.params.externalId, req.body);
  emitChange('bom.updated');
  return ApiResponse.ok(res, { bom }, 'BOM updated');
});

export const removeBom = asyncHandler(async (req, res) => {
  await service.deleteBom(req.params.externalId);
  emitChange('bom.deleted');
  return ApiResponse.ok(res, null, 'BOM deleted');
});

/* ------------------------------ sales orders ----------------------------- */

export const listSalesOrders = asyncHandler(async (req, res) => {
  const { items, page, limit, total } = await service.listSalesOrders(req.query);
  return ApiResponse.paginated(res, items, { page, limit, total }, 'ERP sales orders');
});

export const createSalesOrder = asyncHandler(async (req, res) => {
  const salesOrder = await service.createSalesOrder(req.body);
  emitChange('salesorder.created');
  return ApiResponse.created(res, { salesOrder }, 'Sales order created');
});

export const updateSalesOrder = asyncHandler(async (req, res) => {
  const salesOrder = await service.updateSalesOrder(req.params.externalId, req.body);
  emitChange('salesorder.updated');
  return ApiResponse.ok(res, { salesOrder }, 'Sales order updated');
});

export const dispatchSalesOrder = asyncHandler(async (req, res) => {
  const salesOrder = await service.dispatchSalesOrder(req.params.externalId, req.body);
  emitChange('salesorder.dispatched');
  return ApiResponse.ok(res, { salesOrder }, 'Order dispatched');
});

export const removeSalesOrder = asyncHandler(async (req, res) => {
  await service.deleteSalesOrder(req.params.externalId);
  emitChange('salesorder.deleted');
  return ApiResponse.ok(res, null, 'Sales order deleted');
});

/* --------------------------------- assets -------------------------------- */

export const listAssets = asyncHandler(async (req, res) => {
  const { items, page, limit, total } = await service.listAssets(req.query);
  return ApiResponse.paginated(res, items, { page, limit, total }, 'ERP assets');
});

export const createAsset = asyncHandler(async (req, res) => {
  const asset = await service.createAsset(req.body);
  emitChange('asset.created');
  return ApiResponse.created(res, { asset }, 'Asset created');
});

export const updateAsset = asyncHandler(async (req, res) => {
  const asset = await service.updateAsset(req.params.externalId, req.body);
  emitChange('asset.updated');
  return ApiResponse.ok(res, { asset }, 'Asset updated');
});

export const assignAsset = asyncHandler(async (req, res) => {
  const asset = await service.assignAsset(req.params.externalId, req.body);
  emitChange('asset.assigned');
  return ApiResponse.ok(res, { asset }, 'Asset assigned');
});

export const returnAsset = asyncHandler(async (req, res) => {
  const asset = await service.returnAsset(req.params.externalId);
  emitChange('asset.returned');
  return ApiResponse.ok(res, { asset }, 'Asset returned');
});

export const removeAsset = asyncHandler(async (req, res) => {
  await service.deleteAsset(req.params.externalId);
  emitChange('asset.deleted');
  return ApiResponse.ok(res, null, 'Asset deleted');
});

/* --------------------------------- users --------------------------------- */

export const listUsers = asyncHandler(async (req, res) => {
  const { items, page, limit, total } = await service.listErpUsers(req.query);
  return ApiResponse.paginated(res, items, { page, limit, total }, 'ERP users');
});

export const createUser = asyncHandler(async (req, res) => {
  const user = await service.createErpUser(req.body);
  emitChange('user.created');
  return ApiResponse.created(res, { user }, 'ERP user created');
});

export const updateUser = asyncHandler(async (req, res) => {
  const user = await service.updateErpUser(req.params.externalId, req.body);
  emitChange('user.updated');
  return ApiResponse.ok(res, { user }, 'ERP user updated');
});

export const removeUser = asyncHandler(async (req, res) => {
  await service.deleteErpUser(req.params.externalId);
  emitChange('user.deleted');
  return ApiResponse.ok(res, null, 'ERP user deleted');
});
