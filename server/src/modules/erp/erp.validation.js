import { z } from 'zod';
import { ERP_RAW_MATERIAL_STATUSES } from '../../models/erpRawMaterial.model.js';
import { ERP_FG_QC_STATUSES, ERP_FG_STATUSES } from '../../models/erpFinishedGood.model.js';
import { ERP_BOM_STATUSES } from '../../models/erpBom.model.js';
import { ERP_SALES_ORDER_STATUSES } from '../../models/erpSalesOrder.model.js';
import { ERP_ASSET_STATUSES } from '../../models/erpAsset.model.js';
import { ERP_USER_STATUSES } from '../../models/erpUser.model.js';

// externalId in every /erp/:externalId path IS the ERP Mongo _id (same string
// both sides — no translation table needed).
const erpId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ERP id');

// Dates are forwarded to the ERP as-is (it parses them with new Date()).
const dateString = z.string().trim().max(40);

const pagination = {
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  sort: z.string().optional(),
};

export const externalIdParamSchema = z.object({ externalId: erpId });
export const trackParamSchema = z.object({ code: z.string().trim().min(1).max(100) });

/* ------------------------- suppliers / customers ------------------------- */

export const listContactsSchema = z.object({
  ...pagination,
  search: z.string().optional(),
});

// ERP-native supplier/customer shape (both models are identical over there).
export const contactBodySchema = z.object({
  name: z.string().trim().min(1).max(300),
  contact: z.string().trim().max(100).optional(),
  email: z.union([z.literal(''), z.string().trim().email().max(200)]).optional(),
  address: z.string().trim().max(1000).optional(),
  gstin: z.string().trim().max(50).optional(),
  notes: z.string().trim().max(5000).optional(),
});

export const contactUpdateSchema = contactBodySchema.partial();

/* ----------------------------- raw materials ---------------------------- */

export const listRawMaterialsSchema = z.object({
  ...pagination,
  type: z.string().optional(),
  status: z.enum(ERP_RAW_MATERIAL_STATUSES).optional(),
  search: z.string().optional(),
});

// Batch receive — mirrors the ERP create body (supplierExternalId → supplier).
export const receiveRawMaterialsSchema = z.object({
  materialType: z.string().trim().min(1).max(100),
  quantity: z.coerce.number().int().min(1).max(500),
  supplierExternalId: erpId.optional(),
  // Per-unit serials: array or newline-separated string, exactly as ERP takes it.
  serials: z.union([z.array(z.string().trim()), z.string()]).optional(),
  purchaseDate: dateString.optional(),
  model: z.string().trim().max(300).optional(),
  specification: z.string().trim().max(2000).optional(),
  warranty: z.string().trim().max(300).optional(),
  remarks: z.string().trim().max(2000).optional(),
});

// Detail edits only — status/barcode stay ERP-managed (build/delete cascades).
export const updateRawMaterialSchema = z.object({
  materialType: z.string().trim().min(1).max(100).optional(),
  supplierSerial: z.string().trim().max(200).optional(),
  purchaseDate: dateString.optional(),
  model: z.string().trim().max(300).optional(),
  specification: z.string().trim().max(2000).optional(),
  warranty: z.string().trim().max(300).optional(),
  remarks: z.string().trim().max(2000).optional(),
});

/* ---------------------------- finished goods ---------------------------- */

export const listFinishedGoodsSchema = z.object({
  ...pagination,
  status: z.enum(ERP_FG_STATUSES).optional(),
  qc: z.enum(ERP_FG_QC_STATUSES).optional(),
  search: z.string().optional(),
});

// Production build — consumes the listed raw-material units on the ERP side.
export const buildFinishedGoodSchema = z.object({
  productCode: z.string().trim().min(1).max(50),
  productName: z.string().trim().max(300).optional(),
  rawMaterialBarcodes: z.array(z.string().trim().min(1)).min(1).max(200),
  bomExternalId: erpId.optional(),
  productionDate: dateString.optional(),
});

const checklistItemSchema = z.object({
  item: z.string().trim().min(1).max(300),
  ok: z.boolean().optional(),
  note: z.string().trim().max(1000).optional(),
});

export const submitQcSchema = z.object({
  result: z.enum(['passed', 'failed']),
  checklist: z.array(checklistItemSchema).max(50).optional(),
  qcBy: z.string().trim().max(200).optional(),
  qcRemarks: z.string().trim().max(2000).optional(),
});

/* --------------------------------- BOMs --------------------------------- */

export const listBomsSchema = z.object({
  ...pagination,
  status: z.enum(ERP_BOM_STATUSES).optional(),
  search: z.string().optional(),
});

const bomMaterialSchema = z.object({
  materialType: z.string().trim().min(1).max(100),
  quantity: z.coerce.number().min(0).optional(),
  unitCost: z.coerce.number().min(0).optional(),
  notes: z.string().trim().max(1000).optional(),
});

const bomProcessSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  cost: z.coerce.number().min(0).optional(),
});

export const bomBodySchema = z.object({
  productName: z.string().trim().min(1).max(300),
  productCode: z.string().trim().max(50).optional(),
  outputQuantity: z.coerce.number().int().min(1).optional(),
  materials: z.array(bomMaterialSchema).max(100).optional(),
  processes: z.array(bomProcessSchema).max(100).optional(),
  status: z.enum(ERP_BOM_STATUSES).optional(),
  remarks: z.string().trim().max(2000).optional(),
});

export const bomUpdateSchema = bomBodySchema.partial();

/* ------------------------------ sales orders ----------------------------- */

export const listSalesOrdersSchema = z.object({
  ...pagination,
  status: z.enum(ERP_SALES_ORDER_STATUSES).optional(),
  search: z.string().optional(),
});

export const createSalesOrderSchema = z.object({
  customerExternalId: erpId,
  productCode: z.string().trim().max(50).optional(),
  productName: z.string().trim().max(300).optional(),
  orderedQty: z.coerce.number().int().min(1),
  notes: z.string().trim().max(2000).optional(),
  orderDate: dateString.optional(),
});

// deliveredQty/status/deliveries stay ERP-managed (dispatch owns them).
export const updateSalesOrderSchema = z.object({
  customerExternalId: erpId.optional(),
  productCode: z.string().trim().max(50).optional(),
  productName: z.string().trim().max(300).optional(),
  orderedQty: z.coerce.number().int().min(1).optional(),
  notes: z.string().trim().max(2000).optional(),
  orderDate: dateString.optional(),
});

export const dispatchSalesOrderSchema = z.object({
  finishedGoodBarcodes: z.array(z.string().trim().min(1)).min(1).max(200),
});

/* --------------------------------- assets -------------------------------- */

export const listAssetsSchema = z.object({
  ...pagination,
  status: z.enum(ERP_ASSET_STATUSES).optional(),
  search: z.string().optional(),
});

export const assetBodySchema = z.object({
  name: z.string().trim().min(1).max(300),
  assetType: z.string().trim().max(100).optional(),
  tag: z.string().trim().max(100).optional(),
  purchaseDate: dateString.optional(),
  purchasedBy: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const assetUpdateSchema = assetBodySchema.partial();

export const assignAssetSchema = z.object({
  person: z.string().trim().min(1).max(200),
  note: z.string().trim().max(1000).optional(),
  date: dateString.optional(),
});

/* --------------------------------- users --------------------------------- */

export const listErpUsersSchema = z.object({
  ...pagination,
  role: z.string().optional(),
  search: z.string().optional(),
});

export const createErpUserSchema = z.object({
  name: z.string().trim().min(1).max(200),
  username: z.string().trim().max(100).optional(),
  email: z.union([z.literal(''), z.string().trim().email().max(200)]).optional(),
  // Forwarded to the ERP verbatim — never stored in DDD.
  password: z.string().min(4).max(200).optional(),
  role: z.string().trim().max(100).optional(),
  status: z.enum(ERP_USER_STATUSES).optional(),
});

export const updateErpUserSchema = createErpUserSchema.partial();
