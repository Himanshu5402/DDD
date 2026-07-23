import { Router } from 'express';
import authenticate from '../../middleware/authenticate.middleware.js';
import authorize from '../../middleware/authorize.middleware.js';
import validate from '../../middleware/validate.middleware.js';
import auditAction from '../../middleware/audit.middleware.js';
import { MODULES, ACTIONS } from '../../config/constants.js';
import * as c from './erp.controller.js';
import {
  externalIdParamSchema,
  trackParamSchema,
  listContactsSchema,
  contactBodySchema,
  contactUpdateSchema,
  listRawMaterialsSchema,
  receiveRawMaterialsSchema,
  updateRawMaterialSchema,
  listFinishedGoodsSchema,
  buildFinishedGoodSchema,
  submitQcSchema,
  listBomsSchema,
  bomBodySchema,
  bomUpdateSchema,
  listSalesOrdersSchema,
  createSalesOrderSchema,
  updateSalesOrderSchema,
  dispatchSalesOrderSchema,
  listAssetsSchema,
  assetBodySchema,
  assetUpdateSchema,
  assignAssetSchema,
  listErpUsersSchema,
  createErpUserSchema,
  updateErpUserSchema,
} from './erp.validation.js';

const router = Router();
const M = MODULES.ERP;

router.use(authenticate);

/**
 * @swagger
 * tags: { name: ERP, description: itsybizz-ERP mirror (inventory / production / sales) }
 */

// Mirror-backed aggregate + live traceability proxy.
router.get('/overview', authorize(M, ACTIONS.READ), c.overview);
router.get('/track/:code', authorize(M, ACTIONS.READ), validate({ params: trackParamSchema }), c.track);

/* ------------------------------- suppliers ------------------------------ */

router.get('/suppliers', authorize(M, ACTIONS.READ), validate({ query: listContactsSchema }), c.listSuppliers);
router.post(
  '/suppliers',
  authorize(M, ACTIONS.CREATE),
  validate({ body: contactBodySchema }),
  auditAction({ action: ACTIONS.CREATE, module: M, entityType: 'ErpSupplier', describe: (req) => `Created ERP supplier "${req.body.name}"` }),
  c.createSupplier
);
router.patch(
  '/suppliers/:externalId',
  authorize(M, ACTIONS.UPDATE),
  validate({ params: externalIdParamSchema, body: contactUpdateSchema }),
  auditAction({ action: ACTIONS.UPDATE, module: M, entityType: 'ErpSupplier', entityId: (req) => req.params.externalId }),
  c.updateSupplier
);
router.delete(
  '/suppliers/:externalId',
  authorize(M, ACTIONS.DELETE),
  validate({ params: externalIdParamSchema }),
  auditAction({ action: ACTIONS.DELETE, module: M, entityType: 'ErpSupplier', entityId: (req) => req.params.externalId }),
  c.removeSupplier
);

/* ------------------------------- customers ------------------------------ */

router.get('/customers', authorize(M, ACTIONS.READ), validate({ query: listContactsSchema }), c.listCustomers);
router.post(
  '/customers',
  authorize(M, ACTIONS.CREATE),
  validate({ body: contactBodySchema }),
  auditAction({ action: ACTIONS.CREATE, module: M, entityType: 'ErpCustomer', describe: (req) => `Created ERP customer "${req.body.name}"` }),
  c.createCustomer
);
router.patch(
  '/customers/:externalId',
  authorize(M, ACTIONS.UPDATE),
  validate({ params: externalIdParamSchema, body: contactUpdateSchema }),
  auditAction({ action: ACTIONS.UPDATE, module: M, entityType: 'ErpCustomer', entityId: (req) => req.params.externalId }),
  c.updateCustomer
);
router.delete(
  '/customers/:externalId',
  authorize(M, ACTIONS.DELETE),
  validate({ params: externalIdParamSchema }),
  auditAction({ action: ACTIONS.DELETE, module: M, entityType: 'ErpCustomer', entityId: (req) => req.params.externalId }),
  c.removeCustomer
);

/* ----------------------------- raw materials ---------------------------- */

router.get('/raw-materials', authorize(M, ACTIONS.READ), validate({ query: listRawMaterialsSchema }), c.listRawMaterials);
router.post(
  '/raw-materials',
  authorize(M, ACTIONS.CREATE),
  validate({ body: receiveRawMaterialsSchema }),
  auditAction({
    action: ACTIONS.CREATE,
    module: M,
    entityType: 'ErpRawMaterial',
    describe: (req) => `Received ${req.body.quantity} × ${req.body.materialType} into ERP stock`,
  }),
  c.receiveRawMaterials
);
router.patch(
  '/raw-materials/:externalId',
  authorize(M, ACTIONS.UPDATE),
  validate({ params: externalIdParamSchema, body: updateRawMaterialSchema }),
  auditAction({ action: ACTIONS.UPDATE, module: M, entityType: 'ErpRawMaterial', entityId: (req) => req.params.externalId }),
  c.updateRawMaterial
);
router.delete(
  '/raw-materials/:externalId',
  authorize(M, ACTIONS.DELETE),
  validate({ params: externalIdParamSchema }),
  auditAction({ action: ACTIONS.DELETE, module: M, entityType: 'ErpRawMaterial', entityId: (req) => req.params.externalId }),
  c.removeRawMaterial
);

/* ---------------------------- finished goods ---------------------------- */

router.get('/finished-goods', authorize(M, ACTIONS.READ), validate({ query: listFinishedGoodsSchema }), c.listFinishedGoods);
router.post(
  '/finished-goods',
  authorize(M, ACTIONS.CREATE),
  validate({ body: buildFinishedGoodSchema }),
  auditAction({
    action: ACTIONS.CREATE,
    module: M,
    entityType: 'ErpFinishedGood',
    describe: (req) => `Built ${req.body.productCode} from ${req.body.rawMaterialBarcodes.length} unit(s)`,
  }),
  c.buildFinishedGood
);
router.post(
  '/finished-goods/:externalId/qc',
  authorize(M, ACTIONS.UPDATE),
  validate({ params: externalIdParamSchema, body: submitQcSchema }),
  auditAction({
    action: ACTIONS.UPDATE,
    module: M,
    entityType: 'ErpFinishedGood',
    entityId: (req) => req.params.externalId,
    describe: (req) => `QC ${req.body.result}`,
  }),
  c.submitQc
);
router.delete(
  '/finished-goods/:externalId',
  authorize(M, ACTIONS.DELETE),
  validate({ params: externalIdParamSchema }),
  auditAction({ action: ACTIONS.DELETE, module: M, entityType: 'ErpFinishedGood', entityId: (req) => req.params.externalId }),
  c.removeFinishedGood
);

/* --------------------------------- BOMs --------------------------------- */

router.get('/boms', authorize(M, ACTIONS.READ), validate({ query: listBomsSchema }), c.listBoms);
router.post(
  '/boms',
  authorize(M, ACTIONS.CREATE),
  validate({ body: bomBodySchema }),
  auditAction({ action: ACTIONS.CREATE, module: M, entityType: 'ErpBom', describe: (req) => `Created BOM "${req.body.productName}"` }),
  c.createBom
);
router.patch(
  '/boms/:externalId',
  authorize(M, ACTIONS.UPDATE),
  validate({ params: externalIdParamSchema, body: bomUpdateSchema }),
  auditAction({ action: ACTIONS.UPDATE, module: M, entityType: 'ErpBom', entityId: (req) => req.params.externalId }),
  c.updateBom
);
router.delete(
  '/boms/:externalId',
  authorize(M, ACTIONS.DELETE),
  validate({ params: externalIdParamSchema }),
  auditAction({ action: ACTIONS.DELETE, module: M, entityType: 'ErpBom', entityId: (req) => req.params.externalId }),
  c.removeBom
);

/* ------------------------------ sales orders ----------------------------- */

router.get('/sales-orders', authorize(M, ACTIONS.READ), validate({ query: listSalesOrdersSchema }), c.listSalesOrders);
router.post(
  '/sales-orders',
  authorize(M, ACTIONS.CREATE),
  validate({ body: createSalesOrderSchema }),
  auditAction({
    action: ACTIONS.CREATE,
    module: M,
    entityType: 'ErpSalesOrder',
    describe: (req) => `Created ERP sales order (${req.body.orderedQty} × ${req.body.productCode || 'KS1'})`,
  }),
  c.createSalesOrder
);
router.patch(
  '/sales-orders/:externalId',
  authorize(M, ACTIONS.UPDATE),
  validate({ params: externalIdParamSchema, body: updateSalesOrderSchema }),
  auditAction({ action: ACTIONS.UPDATE, module: M, entityType: 'ErpSalesOrder', entityId: (req) => req.params.externalId }),
  c.updateSalesOrder
);
router.post(
  '/sales-orders/:externalId/dispatch',
  authorize(M, ACTIONS.UPDATE),
  validate({ params: externalIdParamSchema, body: dispatchSalesOrderSchema }),
  auditAction({
    action: ACTIONS.UPDATE,
    module: M,
    entityType: 'ErpSalesOrder',
    entityId: (req) => req.params.externalId,
    describe: (req) => `Dispatched ${req.body.finishedGoodBarcodes.length} unit(s)`,
  }),
  c.dispatchSalesOrder
);
router.delete(
  '/sales-orders/:externalId',
  authorize(M, ACTIONS.DELETE),
  validate({ params: externalIdParamSchema }),
  auditAction({ action: ACTIONS.DELETE, module: M, entityType: 'ErpSalesOrder', entityId: (req) => req.params.externalId }),
  c.removeSalesOrder
);

/* --------------------------------- assets -------------------------------- */

router.get('/assets', authorize(M, ACTIONS.READ), validate({ query: listAssetsSchema }), c.listAssets);
router.post(
  '/assets',
  authorize(M, ACTIONS.CREATE),
  validate({ body: assetBodySchema }),
  auditAction({ action: ACTIONS.CREATE, module: M, entityType: 'ErpAsset', describe: (req) => `Created ERP asset "${req.body.name}"` }),
  c.createAsset
);
router.patch(
  '/assets/:externalId',
  authorize(M, ACTIONS.UPDATE),
  validate({ params: externalIdParamSchema, body: assetUpdateSchema }),
  auditAction({ action: ACTIONS.UPDATE, module: M, entityType: 'ErpAsset', entityId: (req) => req.params.externalId }),
  c.updateAsset
);
router.post(
  '/assets/:externalId/assign',
  authorize(M, ACTIONS.UPDATE),
  validate({ params: externalIdParamSchema, body: assignAssetSchema }),
  auditAction({
    action: ACTIONS.UPDATE,
    module: M,
    entityType: 'ErpAsset',
    entityId: (req) => req.params.externalId,
    describe: (req) => `Assigned to ${req.body.person}`,
  }),
  c.assignAsset
);
router.post(
  '/assets/:externalId/return',
  authorize(M, ACTIONS.UPDATE),
  validate({ params: externalIdParamSchema }),
  auditAction({ action: ACTIONS.UPDATE, module: M, entityType: 'ErpAsset', entityId: (req) => req.params.externalId, describe: () => 'Asset returned' }),
  c.returnAsset
);
router.delete(
  '/assets/:externalId',
  authorize(M, ACTIONS.DELETE),
  validate({ params: externalIdParamSchema }),
  auditAction({ action: ACTIONS.DELETE, module: M, entityType: 'ErpAsset', entityId: (req) => req.params.externalId }),
  c.removeAsset
);

/* --------------------------------- users --------------------------------- */

router.get('/users', authorize(M, ACTIONS.READ), validate({ query: listErpUsersSchema }), c.listUsers);
router.post(
  '/users',
  authorize(M, ACTIONS.CREATE),
  validate({ body: createErpUserSchema }),
  auditAction({ action: ACTIONS.CREATE, module: M, entityType: 'ErpUser', describe: (req) => `Created ERP user "${req.body.name}"` }),
  c.createUser
);
router.patch(
  '/users/:externalId',
  authorize(M, ACTIONS.UPDATE),
  validate({ params: externalIdParamSchema, body: updateErpUserSchema }),
  auditAction({ action: ACTIONS.UPDATE, module: M, entityType: 'ErpUser', entityId: (req) => req.params.externalId }),
  c.updateUser
);
router.delete(
  '/users/:externalId',
  authorize(M, ACTIONS.DELETE),
  validate({ params: externalIdParamSchema }),
  auditAction({ action: ACTIONS.DELETE, module: M, entityType: 'ErpUser', entityId: (req) => req.params.externalId }),
  c.removeUser
);

export default router;
