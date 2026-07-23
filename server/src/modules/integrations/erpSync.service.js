/**
 * itsybizz-ERP → DDD mirror sync (inbound half of the two-way integration).
 *
 * Two entry points, both built on the same idempotent upsert functions:
 *  - handleEvent(event, payload) — real-time pushes from the ERP
 *    (POST /integrations/erp/events). Events may arrive twice (echoes after
 *    write-through) — every upsert converges, never duplicates.
 *  - runBootstrapSync() — full pull of GET {ERP_API_URL}/integration/bootstrap,
 *    replayed through the upserts in dependency order (masters first).
 *
 * Every mirror row is keyed on externalId = the ERP Mongo _id (String).
 * Suppliers/customers land in the shared Contact model ({externalId,
 * sourceSystem:'erp'}); everything else has a dedicated Erp* mirror model.
 * Cross-entity effects mirror the ERP's own cascades: a build consumes raw
 * materials, an FG delete releases them, a dispatch flips finished goods.
 */
import env from '../../config/env.js';
import logger from '../../config/logger.js';
import User from '../../models/user.model.js';
import Contact from '../../models/contact.model.js';
import ErpRawMaterial, { ERP_RAW_MATERIAL_STATUSES } from '../../models/erpRawMaterial.model.js';
import ErpFinishedGood, {
  ERP_FG_QC_STATUSES,
  ERP_FG_STATUSES,
} from '../../models/erpFinishedGood.model.js';
import ErpBom, { ERP_BOM_STATUSES } from '../../models/erpBom.model.js';
import ErpSalesOrder, { ERP_SALES_ORDER_STATUSES } from '../../models/erpSalesOrder.model.js';
import ErpAsset, { ERP_ASSET_STATUSES } from '../../models/erpAsset.model.js';
import ErpUser, { ERP_USER_STATUSES } from '../../models/erpUser.model.js';
import { broadcast } from '../../socket/index.js';
import * as erpClient from '../../services/integrations/erp.client.js';

/* =============================== Helpers ============================== */

/** ERP ids arrive as strings, ObjectIds or populated docs — normalize to String. */
const asId = (value) => {
  if (value == null) return '';
  if (typeof value === 'object' && value._id !== undefined) return String(value._id);
  return String(value);
};

/** Any ERP date value → Date, null if absent/bad. */
function toDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

const inEnum = (list, value, fallback) => (list.includes(value) ? value : fallback);

let systemUserIdCache = null;
/**
 * The DDD user mirrored rows are attributed to (createdBy): the seed admin —
 * earliest active non-HRMS account. Cached for the process lifetime.
 */
async function getSystemUserId() {
  if (systemUserIdCache) return systemUserIdCache;
  const admin =
    (await User.findOne({ isActive: true, source: { $ne: 'hrms' } })
      .sort({ createdAt: 1 })
      .select('_id')) || (await User.findOne().sort({ createdAt: 1 }).select('_id'));
  systemUserIdCache = admin?._id ?? null;
  return systemUserIdCache;
}

/* ===================== Suppliers / customers → Contact ================ */

/**
 * Upsert one ERP supplier/customer into the shared Contact model, keyed on
 * {externalId, sourceSystem:'erp'}. DDD-owned fields (notes, owner, tags) are
 * left untouched; the full ERP shape lives under customFields.erp.
 */
async function upsertErpContact(doc, type) {
  const externalId = asId(doc?._id ?? doc?.id);
  if (!externalId || !doc?.name) return null;
  const createdBy = await getSystemUserId();
  if (!createdBy) return null; // cannot satisfy required createdBy — no users yet

  await Contact.updateOne(
    { externalId, sourceSystem: 'erp' },
    {
      $set: {
        name: doc.name,
        type,
        email: doc.email ? String(doc.email).toLowerCase() : '',
        phone: doc.contact || '',
        status: 'active',
        'customFields.erp': {
          contact: doc.contact || '',
          address: doc.address || '',
          gstin: doc.gstin || '',
          notes: doc.notes || '',
        },
      },
      $setOnInsert: { createdBy },
    },
    { upsert: true }
  );
  return { externalId, type };
}

export const upsertSupplier = (doc) => upsertErpContact(doc, 'supplier');
export const upsertCustomer = (doc) => upsertErpContact(doc, 'customer');

/** ERP hard-deleted the supplier/customer — drop the mirror (scoped, never manual rows). */
export async function removeErpContact(payload) {
  const externalId = asId(payload?.id ?? payload?._id);
  if (!externalId) return null;
  const res = await Contact.deleteOne({ externalId, sourceSystem: 'erp' });
  return { externalId, deleted: res.deletedCount > 0 };
}

/* =========================== Raw materials ============================ */

/** Full ERP raw-material doc → ErpRawMaterial upsert on externalId. */
export async function upsertRawMaterial(doc) {
  const externalId = asId(doc?._id ?? doc?.id);
  if (!externalId) return null;
  const createdBy = await getSystemUserId();
  if (!createdBy) return null;

  await ErpRawMaterial.updateOne(
    { externalId },
    {
      $set: {
        barcode: doc.barcode || '',
        materialType: doc.materialType || '',
        prefix: doc.prefix || '',
        supplierExternalId: asId(doc.supplier),
        supplierName: doc.supplierName || '',
        supplierContact: doc.supplierContact || '',
        supplierAddress: doc.supplierAddress || '',
        supplierSerial: doc.supplierSerial || '',
        purchaseDate: toDate(doc.purchaseDate),
        model: doc.model || '',
        specification: doc.specification || '',
        warranty: doc.warranty || '',
        remarks: doc.remarks || '',
        documentUrl: doc.documentUrl || '',
        status: inEnum(ERP_RAW_MATERIAL_STATUSES, doc.status, 'in_stock'),
        consumedInFgExternalId: asId(doc.consumedInFG),
        source: 'erp',
        lastSyncedAt: new Date(),
      },
      $setOnInsert: { createdBy },
    },
    { upsert: true }
  );
  return { externalId };
}

/** erp.rawmaterial.received — one batch event: {items:[full docs]}. */
export async function receiveRawMaterials(payload) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  let upserted = 0;
  for (const item of items) {
    if (await upsertRawMaterial(item)) upserted += 1;
  }
  return upserted ? { upserted } : null;
}

/** ERP hard-deleted the unit — drop the mirror row so stock counts stay true. */
export async function removeRawMaterial(payload) {
  const externalId = asId(payload?.id ?? payload?._id);
  if (!externalId) return null;
  const res = await ErpRawMaterial.deleteOne({ externalId, source: 'erp' });
  return { externalId, deleted: res.deletedCount > 0 };
}

/* ================================ BOMs ================================ */

/** Full ERP BOM doc → ErpBom upsert on externalId. */
export async function upsertBom(doc) {
  const externalId = asId(doc?._id ?? doc?.id);
  if (!externalId) return null;
  const createdBy = await getSystemUserId();
  if (!createdBy) return null;

  await ErpBom.updateOne(
    { externalId },
    {
      $set: {
        productName: doc.productName || '',
        productCode: doc.productCode || '',
        outputQuantity: Math.max(0, Number(doc.outputQuantity) || 1),
        materials: (Array.isArray(doc.materials) ? doc.materials : []).map((m) => ({
          materialType: m?.materialType || '',
          quantity: Math.max(0, Number(m?.quantity) || 0),
          unitCost: Math.max(0, Number(m?.unitCost) || 0),
          notes: m?.notes || '',
        })),
        processes: (Array.isArray(doc.processes) ? doc.processes : []).map((p) => ({
          name: p?.name || '',
          description: p?.description || '',
          cost: Math.max(0, Number(p?.cost) || 0),
        })),
        materialCost: Math.max(0, Number(doc.materialCost) || 0),
        processCost: Math.max(0, Number(doc.processCost) || 0),
        totalCost: Math.max(0, Number(doc.totalCost) || 0),
        costPerUnit: Math.max(0, Number(doc.costPerUnit) || 0),
        status: inEnum(ERP_BOM_STATUSES, doc.status, 'active'),
        remarks: doc.remarks || '',
        source: 'erp',
        lastSyncedAt: new Date(),
      },
      $setOnInsert: { createdBy },
    },
    { upsert: true }
  );
  return { externalId };
}

/** ERP hard-deleted the BOM — drop the mirror row. */
export async function removeBom(payload) {
  const externalId = asId(payload?.id ?? payload?._id);
  if (!externalId) return null;
  const res = await ErpBom.deleteOne({ externalId, source: 'erp' });
  return { externalId, deleted: res.deletedCount > 0 };
}

/* =========================== Finished goods =========================== */

/** Full ERP finished-good doc → ErpFinishedGood upsert on externalId. */
export async function upsertFinishedGood(doc) {
  const externalId = asId(doc?._id ?? doc?.id);
  if (!externalId) return null;
  const createdBy = await getSystemUserId();
  if (!createdBy) return null;

  await ErpFinishedGood.updateOne(
    { externalId },
    {
      $set: {
        barcode: doc.barcode || '',
        productCode: doc.productCode || '',
        productName: doc.productName || '',
        productionDate: toDate(doc.productionDate),
        qcStatus: inEnum(ERP_FG_QC_STATUSES, doc.qcStatus, 'pending'),
        qcBy: doc.qcBy || '',
        qcRemarks: doc.qcRemarks || '',
        qcDate: toDate(doc.qcDate),
        status: inEnum(ERP_FG_STATUSES, doc.status, 'in_stock'),
        customerName: doc.customerName || '',
        dispatchDate: toDate(doc.dispatchDate),
        salesOrderExternalId: asId(doc.salesOrder),
        rawMaterials: (Array.isArray(doc.rawMaterials) ? doc.rawMaterials : []).map((rm) => ({
          externalId: asId(rm),
          barcode: rm?.barcode || '',
          materialType: rm?.materialType || '',
        })),
        bomExternalId: asId(doc.bom),
        source: 'erp',
        lastSyncedAt: new Date(),
      },
      $setOnInsert: { createdBy },
    },
    { upsert: true }
  );
  return { externalId };
}

/**
 * erp.finishedgood.built — mirror the new FG AND flip the consumed raw-material
 * mirrors, exactly like the ERP's own build cascade.
 */
export async function applyFinishedGoodBuilt(doc) {
  const result = await upsertFinishedGood(doc);
  if (!result) return null;

  const rmIds = (Array.isArray(doc.rawMaterials) ? doc.rawMaterials : [])
    .map(asId)
    .filter(Boolean);
  if (rmIds.length) {
    await ErpRawMaterial.updateMany(
      { externalId: { $in: rmIds }, source: 'erp' },
      {
        $set: {
          status: 'consumed',
          consumedInFgExternalId: result.externalId,
          lastSyncedAt: new Date(),
        },
      }
    );
  }
  return { ...result, consumedRawMaterials: rmIds.length };
}

/**
 * erp.finishedgood.deleted — {id, barcode, releasedRawMaterialIds}. Drop the
 * FG mirror and release the raw-material mirrors back to stock (the ERP's
 * delete cascade). Falls back to the mirror's own rawMaterials list when the
 * payload omits the released ids.
 */
export async function removeFinishedGood(payload) {
  const externalId = asId(payload?.id ?? payload?._id);
  if (!externalId) return null;

  let releasedIds = (Array.isArray(payload?.releasedRawMaterialIds)
    ? payload.releasedRawMaterialIds
    : []
  )
    .map(asId)
    .filter(Boolean);
  if (!releasedIds.length) {
    const mirror = await ErpFinishedGood.findOne({ externalId }).select('rawMaterials');
    releasedIds = (mirror?.rawMaterials || []).map((rm) => rm.externalId).filter(Boolean);
  }

  if (releasedIds.length) {
    await ErpRawMaterial.updateMany(
      { externalId: { $in: releasedIds }, source: 'erp' },
      { $set: { status: 'in_stock', consumedInFgExternalId: '', lastSyncedAt: new Date() } }
    );
  }

  const res = await ErpFinishedGood.deleteOne({ externalId, source: 'erp' });
  return { externalId, deleted: res.deletedCount > 0, releasedRawMaterials: releasedIds.length };
}

/* ============================ Sales orders ============================ */

/** Full ERP sales-order doc → ErpSalesOrder upsert on externalId. */
export async function upsertSalesOrder(doc) {
  const externalId = asId(doc?._id ?? doc?.id);
  if (!externalId) return null;
  const createdBy = await getSystemUserId();
  if (!createdBy) return null;

  await ErpSalesOrder.updateOne(
    { externalId },
    {
      $set: {
        orderNo: doc.orderNo || '',
        customerExternalId: asId(doc.customer),
        customerName: doc.customerName || '',
        productCode: doc.productCode || '',
        productName: doc.productName || '',
        orderedQty: Math.max(0, Number(doc.orderedQty) || 0),
        deliveredQty: Math.max(0, Number(doc.deliveredQty) || 0),
        status: inEnum(ERP_SALES_ORDER_STATUSES, doc.status, 'open'),
        orderDate: toDate(doc.orderDate),
        notes: doc.notes || '',
        deliveries: (Array.isArray(doc.deliveries) ? doc.deliveries : []).map((d) => ({
          qty: Math.max(0, Number(d?.qty) || 0),
          date: toDate(d?.date),
          finishedGoodExternalIds: (Array.isArray(d?.finishedGoods) ? d.finishedGoods : [])
            .map(asId)
            .filter(Boolean),
        })),
        source: 'erp',
        lastSyncedAt: new Date(),
      },
      $setOnInsert: { createdBy },
    },
    { upsert: true }
  );
  return { externalId };
}

/**
 * erp.salesorder.dispatched — {order, dispatchedFinishedGoodIds}. Mirror the
 * updated order AND flip the dispatched FG mirrors (the ERP flips them via
 * updateMany without emitting per-FG events).
 */
export async function applySalesOrderDispatched(payload) {
  const order = payload?.order;
  const result = await upsertSalesOrder(order);
  if (!result) return null;

  const fgIds = (Array.isArray(payload?.dispatchedFinishedGoodIds)
    ? payload.dispatchedFinishedGoodIds
    : []
  )
    .map(asId)
    .filter(Boolean);
  if (fgIds.length) {
    await ErpFinishedGood.updateMany(
      { externalId: { $in: fgIds }, source: 'erp' },
      {
        $set: {
          status: 'dispatched',
          salesOrderExternalId: result.externalId,
          customerName: order?.customerName || '',
          dispatchDate: new Date(),
          lastSyncedAt: new Date(),
        },
      }
    );
  }
  return { ...result, dispatchedFinishedGoods: fgIds.length };
}

/** ERP hard-deleted the order — drop the mirror row. */
export async function removeSalesOrder(payload) {
  const externalId = asId(payload?.id ?? payload?._id);
  if (!externalId) return null;
  const res = await ErpSalesOrder.deleteOne({ externalId, source: 'erp' });
  return { externalId, deleted: res.deletedCount > 0 };
}

/* =============================== Assets =============================== */

/** Full ERP asset doc → ErpAsset upsert on externalId (create/update/assign/return). */
export async function upsertErpAsset(doc) {
  const externalId = asId(doc?._id ?? doc?.id);
  if (!externalId) return null;
  const createdBy = await getSystemUserId();
  if (!createdBy) return null;

  await ErpAsset.updateOne(
    { externalId },
    {
      $set: {
        name: doc.name || '',
        assetType: doc.assetType || 'Other',
        tag: doc.tag || '',
        purchaseDate: toDate(doc.purchaseDate),
        purchasedBy: doc.purchasedBy || '',
        notes: doc.notes || '',
        status: inEnum(ERP_ASSET_STATUSES, doc.status, 'available'),
        currentHolder: doc.currentHolder || '',
        history: (Array.isArray(doc.history) ? doc.history : []).map((h) => ({
          action: h?.action,
          person: h?.person || '',
          date: toDate(h?.date),
          note: h?.note || '',
        })),
        source: 'erp',
        lastSyncedAt: new Date(),
      },
      $setOnInsert: { createdBy },
    },
    { upsert: true }
  );
  return { externalId };
}

/** ERP hard-deleted the asset — drop the mirror row. */
export async function removeErpAsset(payload) {
  const externalId = asId(payload?.id ?? payload?._id);
  if (!externalId) return null;
  const res = await ErpAsset.deleteOne({ externalId, source: 'erp' });
  return { externalId, deleted: res.deletedCount > 0 };
}

/* ================================ Users =============================== */

/** ERP user doc (never contains the password) → ErpUser upsert on externalId. */
export async function upsertErpUser(doc) {
  const externalId = asId(doc?._id ?? doc?.id);
  if (!externalId) return null;
  const createdBy = await getSystemUserId();
  if (!createdBy) return null;

  await ErpUser.updateOne(
    { externalId },
    {
      $set: {
        name: doc.name || '',
        username: doc.username ? String(doc.username).toLowerCase() : '',
        email: doc.email ? String(doc.email).toLowerCase() : '',
        role: doc.role || '',
        status: inEnum(ERP_USER_STATUSES, doc.status, 'active'),
        source: 'erp',
        lastSyncedAt: new Date(),
      },
      $setOnInsert: { createdBy },
    },
    { upsert: true }
  );
  return { externalId };
}

/** ERP hard-deleted the user — drop the mirror row. */
export async function removeErpUser(payload) {
  const externalId = asId(payload?.id ?? payload?._id);
  if (!externalId) return null;
  const res = await ErpUser.deleteOne({ externalId, source: 'erp' });
  return { externalId, deleted: res.deletedCount > 0 };
}

/* ============================ Event router ============================ */

// event → idempotent handler. All ERP mirrors share ONE socket event
// ('erp:changed') — open ERP pages treat it purely as a refetch nudge.
const EVENT_HANDLERS = {
  'erp.supplier.created': upsertSupplier,
  'erp.supplier.updated': upsertSupplier,
  'erp.supplier.deleted': removeErpContact,
  'erp.customer.created': upsertCustomer,
  'erp.customer.updated': upsertCustomer,
  'erp.customer.deleted': removeErpContact,
  'erp.rawmaterial.received': receiveRawMaterials,
  'erp.rawmaterial.updated': upsertRawMaterial,
  'erp.rawmaterial.deleted': removeRawMaterial,
  'erp.finishedgood.built': applyFinishedGoodBuilt,
  'erp.finishedgood.qc': upsertFinishedGood,
  'erp.finishedgood.deleted': removeFinishedGood,
  'erp.bom.created': upsertBom,
  'erp.bom.updated': upsertBom,
  'erp.bom.deleted': removeBom,
  'erp.salesorder.created': upsertSalesOrder,
  'erp.salesorder.updated': upsertSalesOrder,
  'erp.salesorder.dispatched': applySalesOrderDispatched,
  'erp.salesorder.deleted': removeSalesOrder,
  'erp.asset.created': upsertErpAsset,
  'erp.asset.updated': upsertErpAsset,
  'erp.asset.assigned': upsertErpAsset,
  'erp.asset.returned': upsertErpAsset,
  'erp.asset.deleted': removeErpAsset,
  'erp.user.created': upsertErpUser,
  'erp.user.updated': upsertErpUser,
  'erp.user.deleted': removeErpUser,
};

/**
 * Route one pushed ERP event to its idempotent upsert. Unknown events are
 * acknowledged as {ignored:true} (forward-compatible — never an error).
 */
export async function handleEvent(event, payload = {}) {
  const handler = EVENT_HANDLERS[event];
  if (!handler) return { ignored: true, event };

  const result = await handler(payload);

  if (result) {
    broadcast('erp:changed', { type: `erp:${event}`, at: Date.now() });
  }
  return { event, handled: Boolean(result) };
}

/* =========================== Bootstrap sync =========================== */

let lastSyncAt = null;

export function getLastSyncAt() {
  return lastSyncAt;
}

/**
 * Full mirror rebuild: pull GET {ERP_API_URL}/integration/bootstrap and replay
 * it through the same upserts in dependency order — masters (suppliers,
 * customers, BOMs) before stock (raw materials, finished goods) before the
 * documents referencing stock (sales orders), then assets and users.
 */
export async function runBootstrapSync() {
  const body = await erpClient.get('/integration/bootstrap');
  const snap = body?.data ?? body ?? {};

  const counts = {
    suppliers: 0,
    customers: 0,
    boms: 0,
    rawMaterials: 0,
    finishedGoods: 0,
    salesOrders: 0,
    assets: 0,
    users: 0,
  };
  const count = (key, value) => {
    if (value) counts[key] += 1;
  };

  for (const doc of snap.suppliers || []) count('suppliers', await upsertSupplier(doc));
  for (const doc of snap.customers || []) count('customers', await upsertCustomer(doc));
  for (const doc of snap.boms || []) count('boms', await upsertBom(doc));
  // Raw-material statuses in the snapshot already reflect consumption — plain
  // upserts converge without replaying the build cascade.
  for (const doc of snap.rawMaterials || []) count('rawMaterials', await upsertRawMaterial(doc));
  for (const doc of snap.finishedGoods || []) count('finishedGoods', await upsertFinishedGood(doc));
  for (const doc of snap.salesOrders || []) count('salesOrders', await upsertSalesOrder(doc));
  for (const doc of snap.assets || []) count('assets', await upsertErpAsset(doc));
  for (const doc of snap.users || []) count('users', await upsertErpUser(doc));

  lastSyncAt = new Date();
  broadcast('erp:changed', { type: 'erp:bootstrap-sync', at: Date.now() });

  logger.info(`ERP bootstrap sync complete: ${JSON.stringify(counts)}`);
  return { status: 'synced', lastSyncAt, ...counts };
}

/* ============================== Status ================================ */

/** Integration status for the owner console + ERP-side monitoring. */
export async function getStatus() {
  const [
    erpReachable,
    suppliers,
    customers,
    rawMaterials,
    finishedGoods,
    boms,
    salesOrders,
    assets,
    users,
  ] = await Promise.all([
    erpClient.pingErp(),
    Contact.countDocuments({ sourceSystem: 'erp', type: 'supplier' }),
    Contact.countDocuments({ sourceSystem: 'erp', type: 'customer' }),
    ErpRawMaterial.countDocuments({ source: 'erp' }),
    ErpFinishedGood.countDocuments({ source: 'erp' }),
    ErpBom.countDocuments({ source: 'erp' }),
    ErpSalesOrder.countDocuments({ source: 'erp' }),
    ErpAsset.countDocuments({ source: 'erp' }),
    ErpUser.countDocuments({ source: 'erp' }),
  ]);

  return {
    enabled: env.ERP_SYNC_ENABLED && erpClient.isErpConfigured(),
    erpReachable,
    lastSyncAt,
    counts: {
      suppliers,
      customers,
      rawMaterials,
      finishedGoods,
      boms,
      salesOrders,
      assets,
      users,
    },
  };
}
