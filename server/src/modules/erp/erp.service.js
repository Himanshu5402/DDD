/**
 * ERP owner module (mirror-backed reads, write-through-first writes).
 *
 * Reads serve from the LOCAL Erp* mirror models (fast, works when the ERP is
 * down). Writes forward to the ERP /integration/* endpoints FIRST — an
 * unreachable ERP propagates as 502 and NOTHING mutates locally — then upsert
 * the mirror from the ERP response; the ERP's echo event converges the same
 * row again (harmless, idempotent).
 *
 * externalId in every path IS the ERP Mongo _id, so outbound paths need no
 * translation. Cross-entity effects (build consumes RMs, dispatch flips FGs)
 * reuse the same handlers the event inbox uses.
 */
import Contact from '../../models/contact.model.js';
import ErpRawMaterial from '../../models/erpRawMaterial.model.js';
import ErpFinishedGood from '../../models/erpFinishedGood.model.js';
import ErpBom from '../../models/erpBom.model.js';
import ErpSalesOrder from '../../models/erpSalesOrder.model.js';
import ErpAsset from '../../models/erpAsset.model.js';
import ErpUser from '../../models/erpUser.model.js';
import ApiError from '../../utils/ApiError.js';
import { parsePagination } from '../../utils/pagination.js';
import * as erpClient from '../../services/integrations/erp.client.js';
import * as sync from '../integrations/erpSync.service.js';

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const rx = (search) => new RegExp(escapeRegex(search), 'i');

/** Drop undefined keys so partial PATCH bodies forward only what was sent. */
function compact(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

async function paginatedList(Model, filter, query, { defaultLimit = 25 } = {}) {
  const { page, limit, skip, sort } = parsePagination(query, { defaultLimit });
  const [items, total] = await Promise.all([
    Model.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    Model.countDocuments(filter),
  ]);
  return { items, page, limit, total };
}

/* ===================== Suppliers / customers (Contact) ================ */

function contactFilter(type, query) {
  const filter = { sourceSystem: 'erp', type };
  if (query.search) {
    const r = rx(query.search);
    filter.$or = [{ name: r }, { email: r }, { phone: r }];
  }
  return filter;
}

export const listSuppliers = (query) => paginatedList(Contact, contactFilter('supplier', query), query);
export const listCustomers = (query) => paginatedList(Contact, contactFilter('customer', query), query);

export async function createSupplier(body) {
  const doc = await erpClient.post('/integration/suppliers', body);
  await sync.upsertSupplier(doc);
  return doc;
}

export async function updateSupplier(externalId, body) {
  const doc = await erpClient.put(`/integration/suppliers/${externalId}`, compact(body));
  await sync.upsertSupplier(doc);
  return doc;
}

export async function deleteSupplier(externalId) {
  await erpClient.del(`/integration/suppliers/${externalId}`);
  await sync.removeErpContact({ id: externalId });
  return { externalId };
}

export async function createCustomer(body) {
  const doc = await erpClient.post('/integration/customers', body);
  await sync.upsertCustomer(doc);
  return doc;
}

export async function updateCustomer(externalId, body) {
  const doc = await erpClient.put(`/integration/customers/${externalId}`, compact(body));
  await sync.upsertCustomer(doc);
  return doc;
}

export async function deleteCustomer(externalId) {
  await erpClient.del(`/integration/customers/${externalId}`);
  await sync.removeErpContact({ id: externalId });
  return { externalId };
}

/* =========================== Raw materials ============================ */

export function listRawMaterials(query) {
  const filter = {};
  if (query.type) filter.materialType = query.type;
  if (query.status) filter.status = query.status;
  if (query.search) {
    const r = rx(query.search);
    filter.$or = [{ barcode: r }, { model: r }, { supplierName: r }, { supplierSerial: r }];
  }
  return paginatedList(ErpRawMaterial, filter, query);
}

/** Batch receive — DDD body → ERP wire body (supplierExternalId → supplier). */
export async function receiveRawMaterials(body) {
  const wire = compact({
    materialType: body.materialType,
    quantity: body.quantity,
    supplier: body.supplierExternalId,
    serials: body.serials,
    purchaseDate: body.purchaseDate,
    model: body.model,
    specification: body.specification,
    warranty: body.warranty,
    remarks: body.remarks,
  });
  const res = await erpClient.post('/integration/raw-materials', wire);
  const items = Array.isArray(res?.items) ? res.items : [];
  for (const item of items) await sync.upsertRawMaterial(item);
  return { count: res?.count ?? items.length, items };
}

export async function updateRawMaterial(externalId, body) {
  const doc = await erpClient.put(`/integration/raw-materials/${externalId}`, compact(body));
  await sync.upsertRawMaterial(doc);
  return doc;
}

export async function deleteRawMaterial(externalId) {
  // The ERP refuses when the unit is consumed (400) — that passes through
  // before the mirror is touched.
  await erpClient.del(`/integration/raw-materials/${externalId}`);
  await sync.removeRawMaterial({ id: externalId });
  return { externalId };
}

/* =========================== Finished goods =========================== */

export function listFinishedGoods(query) {
  const filter = {};
  if (query.status) filter.status = query.status;
  if (query.qc) filter.qcStatus = query.qc;
  if (query.search) {
    const r = rx(query.search);
    filter.$or = [{ barcode: r }, { productCode: r }, { productName: r }, { customerName: r }];
  }
  return paginatedList(ErpFinishedGood, filter, query);
}

/** Production build — bomExternalId → bom; consumes RM mirrors on success. */
export async function buildFinishedGood(body) {
  const wire = compact({
    productCode: body.productCode,
    productName: body.productName,
    rawMaterialBarcodes: body.rawMaterialBarcodes,
    bom: body.bomExternalId,
    productionDate: body.productionDate,
  });
  const doc = await erpClient.post('/integration/finished-goods', wire);
  await sync.applyFinishedGoodBuilt(doc);
  return doc;
}

export async function submitQc(externalId, body) {
  const doc = await erpClient.put(`/integration/finished-goods/${externalId}/qc`, compact(body));
  await sync.upsertFinishedGood(doc);
  return doc;
}

export async function deleteFinishedGood(externalId) {
  // ERP refuses when dispatched (400). On success removeFinishedGood also
  // releases this FG's raw-material mirrors back to stock (the ERP cascade).
  await erpClient.del(`/integration/finished-goods/${externalId}`);
  await sync.removeFinishedGood({ id: externalId });
  return { externalId };
}

/* ================================ BOMs ================================ */

export function listBoms(query) {
  const filter = {};
  if (query.status) filter.status = query.status;
  if (query.search) {
    const r = rx(query.search);
    filter.$or = [{ productName: r }, { productCode: r }];
  }
  return paginatedList(ErpBom, filter, query);
}

export async function createBom(body) {
  const doc = await erpClient.post('/integration/boms', body);
  await sync.upsertBom(doc);
  return doc;
}

export async function updateBom(externalId, body) {
  const doc = await erpClient.put(`/integration/boms/${externalId}`, compact(body));
  await sync.upsertBom(doc);
  return doc;
}

export async function deleteBom(externalId) {
  await erpClient.del(`/integration/boms/${externalId}`);
  await sync.removeBom({ id: externalId });
  return { externalId };
}

/* ============================ Sales orders ============================ */

export function listSalesOrders(query) {
  const filter = {};
  if (query.status) filter.status = query.status;
  if (query.search) {
    const r = rx(query.search);
    filter.$or = [{ orderNo: r }, { customerName: r }, { productCode: r }, { productName: r }];
  }
  return paginatedList(ErpSalesOrder, filter, query);
}

/** DDD body → ERP wire body (customerExternalId → customer). */
function toSalesOrderWire(body) {
  return compact({
    customer: body.customerExternalId,
    productCode: body.productCode,
    productName: body.productName,
    orderedQty: body.orderedQty,
    notes: body.notes,
    orderDate: body.orderDate,
  });
}

export async function createSalesOrder(body) {
  const doc = await erpClient.post('/integration/sales-orders', toSalesOrderWire(body));
  await sync.upsertSalesOrder(doc);
  return doc;
}

export async function updateSalesOrder(externalId, body) {
  const doc = await erpClient.put(`/integration/sales-orders/${externalId}`, toSalesOrderWire(body));
  await sync.upsertSalesOrder(doc);
  return doc;
}

export async function dispatchSalesOrder(externalId, body) {
  const order = await erpClient.post(`/integration/sales-orders/${externalId}/dispatch`, {
    finishedGoodBarcodes: body.finishedGoodBarcodes,
  });
  await sync.upsertSalesOrder(order);
  // Flip the dispatched FG mirrors by barcode — the ERP flips its own via
  // updateMany without per-FG events; the dispatched echo event converges the
  // same rows again (idempotent).
  await ErpFinishedGood.updateMany(
    { barcode: { $in: body.finishedGoodBarcodes }, source: 'erp' },
    {
      $set: {
        status: 'dispatched',
        salesOrderExternalId: externalId,
        customerName: order?.customerName || '',
        dispatchDate: new Date(),
        lastSyncedAt: new Date(),
      },
    }
  );
  return order;
}

export async function deleteSalesOrder(externalId) {
  // ERP refuses when deliveries exist (400) — passes through untouched.
  await erpClient.del(`/integration/sales-orders/${externalId}`);
  await sync.removeSalesOrder({ id: externalId });
  return { externalId };
}

/* =============================== Assets =============================== */

export function listAssets(query) {
  const filter = {};
  if (query.status) filter.status = query.status;
  if (query.search) {
    const r = rx(query.search);
    filter.$or = [{ name: r }, { tag: r }, { currentHolder: r }, { assetType: r }];
  }
  return paginatedList(ErpAsset, filter, query);
}

export async function createAsset(body) {
  const doc = await erpClient.post('/integration/assets', body);
  await sync.upsertErpAsset(doc);
  return doc;
}

export async function updateAsset(externalId, body) {
  const doc = await erpClient.put(`/integration/assets/${externalId}`, compact(body));
  await sync.upsertErpAsset(doc);
  return doc;
}

export async function assignAsset(externalId, body) {
  const doc = await erpClient.post(`/integration/assets/${externalId}/assign`, compact(body));
  await sync.upsertErpAsset(doc);
  return doc;
}

export async function returnAsset(externalId) {
  const doc = await erpClient.post(`/integration/assets/${externalId}/return`, {});
  await sync.upsertErpAsset(doc);
  return doc;
}

export async function deleteAsset(externalId) {
  await erpClient.del(`/integration/assets/${externalId}`);
  await sync.removeErpAsset({ id: externalId });
  return { externalId };
}

/* ================================ Users =============================== */

export function listErpUsers(query) {
  const filter = {};
  if (query.role) filter.role = query.role;
  if (query.search) {
    const r = rx(query.search);
    filter.$or = [{ name: r }, { username: r }, { email: r }];
  }
  return paginatedList(ErpUser, filter, query);
}

export async function createErpUser(body) {
  // password is forwarded to the ERP verbatim and never stored in DDD — the
  // response doc (and thus the mirror) never contains it.
  const doc = await erpClient.post('/integration/users', body);
  await sync.upsertErpUser(doc);
  return doc;
}

export async function updateErpUser(externalId, body) {
  const doc = await erpClient.put(`/integration/users/${externalId}`, compact(body));
  await sync.upsertErpUser(doc);
  return doc;
}

export async function deleteErpUser(externalId) {
  await erpClient.del(`/integration/users/${externalId}`);
  await sync.removeErpUser({ id: externalId });
  return { externalId };
}

/* ============================ Traceability ============================ */

/** Live proxy to the ERP traceability passport (502 when the ERP is down). */
export async function trackCode(code) {
  const result = await erpClient.get(`/integration/track/${encodeURIComponent(code)}`);
  if (!result) throw ApiError.notFound('No record found for this code');
  return result;
}

/* ============================== Overview ============================== */

const countsByKey = (rows) => Object.fromEntries(rows.map((r) => [r._id || '', r.count]));

/** Mirror-backed aggregate for the ERP overview page (works when ERP is down). */
export async function getOverview() {
  const [
    rmStatusRows,
    rmTypeRows,
    fgStatusRows,
    fgQcRows,
    orderStatusRows,
    assetStatusRows,
    suppliers,
    customers,
    users,
    erpReachable,
  ] = await Promise.all([
    ErpRawMaterial.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    ErpRawMaterial.aggregate([
      { $match: { status: 'in_stock' } },
      { $group: { _id: '$materialType', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    ErpFinishedGood.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    ErpFinishedGood.aggregate([{ $group: { _id: '$qcStatus', count: { $sum: 1 } } }]),
    ErpSalesOrder.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    ErpAsset.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Contact.countDocuments({ sourceSystem: 'erp', type: 'supplier' }),
    Contact.countDocuments({ sourceSystem: 'erp', type: 'customer' }),
    ErpUser.countDocuments({ source: 'erp' }),
    erpClient.pingErp(),
  ]);

  const rmStatus = countsByKey(rmStatusRows);
  const fgStatus = countsByKey(fgStatusRows);
  const fgQc = countsByKey(fgQcRows);
  const orders = countsByKey(orderStatusRows);
  const assets = countsByKey(assetStatusRows);

  return {
    rawMaterials: {
      inStock: rmStatus.in_stock || 0,
      consumed: rmStatus.consumed || 0,
      byType: rmTypeRows.map((r) => ({ type: r._id || '', count: r.count })),
    },
    finishedGoods: {
      inStock: fgStatus.in_stock || 0,
      dispatched: fgStatus.dispatched || 0,
      pendingQC: fgQc.pending || 0,
      passed: fgQc.passed || 0,
      failed: fgQc.failed || 0,
    },
    salesOrders: {
      open: orders.open || 0,
      partial: orders.partial || 0,
      completed: orders.completed || 0,
    },
    assets: {
      available: assets.available || 0,
      assigned: assets.assigned || 0,
    },
    contacts: { suppliers, customers },
    users,
    erpReachable,
    lastSyncAt: await sync.getLastSyncAt(),
  };
}
