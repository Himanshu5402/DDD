import api from '../lib/axios.js';

// --- Enum option lists (mirror the ERP models / DDD erp* mirror models) -----
export const RAW_MATERIAL_STATUSES = ['in_stock', 'consumed'];
export const FINISHED_GOOD_STATUSES = ['in_stock', 'dispatched'];
export const QC_STATUSES = ['pending', 'passed', 'failed'];
export const QC_RESULTS = ['passed', 'failed'];
export const SALES_ORDER_STATUSES = ['open', 'partial', 'completed'];
export const ERP_ASSET_STATUSES = ['available', 'assigned'];
export const ERP_USER_STATUSES = ['active', 'inactive'];

/**
 * Friendly message for ERP write-through/forward failures. A 502 from the DDD
 * server means the ERP itself could not be reached — surface that clearly.
 * A 409 usually means the mirror row has no externalId yet ("run a sync first").
 */
export function erpErrorMessage(error, fallback = 'Something went wrong') {
  if (error?.response?.status === 502) return 'ERP unreachable — try again';
  return error?.response?.data?.message || error?.message || fallback;
}

/**
 * Generic CRUD against /erp/<resource>, keyed by the ERP externalId.
 * Lists serve from local mirrors (fast, work when the ERP is down);
 * writes go through to the ERP first, then update the mirror.
 */
function createErpClient(resource) {
  return {
    // Returns the full envelope { data: rows, meta? } so callers can read totals.
    async list(params = {}) {
      const { data } = await api.get(`/erp/${resource}`, { params });
      return data;
    },
    async create(payload) {
      const { data } = await api.post(`/erp/${resource}`, payload);
      return data.data;
    },
    async update(externalId, payload) {
      const { data } = await api.patch(`/erp/${resource}/${externalId}`, payload);
      return data.data;
    },
    async remove(externalId) {
      await api.delete(`/erp/${resource}/${externalId}`);
    },
  };
}

export const erpSuppliersApi = createErpClient('suppliers');
export const erpCustomersApi = createErpClient('customers');
export const erpBomsApi = createErpClient('boms');
export const erpUsersApi = createErpClient('users');

// Raw materials: create = batch receive
// { materialType, quantity, supplierExternalId?, serials?, purchaseDate?, model?, specification?, warranty?, remarks? }
export const erpRawMaterialsApi = createErpClient('raw-materials');

export const erpFinishedGoodsApi = {
  ...createErpClient('finished-goods'),
  // Production build: { productCode, productName, rawMaterialBarcodes: [], bomExternalId? }
  // QC: { result: 'passed'|'failed', checklist?, qcBy?, qcRemarks? }
  async qc(externalId, payload) {
    const { data } = await api.post(`/erp/finished-goods/${externalId}/qc`, payload);
    return data.data;
  },
};

export const erpSalesOrdersApi = {
  ...createErpClient('sales-orders'),
  async dispatch(externalId, finishedGoodBarcodes) {
    const { data } = await api.post(`/erp/sales-orders/${externalId}/dispatch`, { finishedGoodBarcodes });
    return data.data;
  },
};

export const erpAssetsApi = {
  ...createErpClient('assets'),
  async assign(externalId, payload) {
    const { data } = await api.post(`/erp/assets/${externalId}/assign`, payload);
    return data.data;
  },
  async returnAsset(externalId) {
    const { data } = await api.post(`/erp/assets/${externalId}/return`, {});
    return data.data;
  },
};

export const erpApi = {
  suppliers: erpSuppliersApi,
  customers: erpCustomersApi,
  rawMaterials: erpRawMaterialsApi,
  finishedGoods: erpFinishedGoodsApi,
  boms: erpBomsApi,
  salesOrders: erpSalesOrdersApi,
  assets: erpAssetsApi,
  users: erpUsersApi,

  // Aggregated mirror stats + reachability for the Overview tab.
  async overview() {
    const { data } = await api.get('/erp/overview');
    return data.data ?? data;
  },
  // Traceability passport — live proxy to the ERP (502 when it is down).
  // ERP-native shape: { kind: 'finished_good'|'raw_material', finishedGood?, rawMaterial? }
  async track(code) {
    const { data } = await api.get(`/erp/track/${encodeURIComponent(code)}`);
    return data.data ?? data;
  },
  async status() {
    const { data } = await api.get('/integrations/erp/status');
    return data.data; // { enabled, erpReachable, lastSyncAt, counts }
  },
  // Full bootstrap pull from the ERP into the DDD mirrors.
  async sync() {
    const { data } = await api.post('/integrations/erp/sync');
    return data; // { data: { ...counts }, message }
  },
};
