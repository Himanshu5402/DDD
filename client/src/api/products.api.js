import api from "../lib/axios.js";

// Categories are admin-managed on the server (productsApi.categories) —
// no hardcoded catalog in code.
export const PRODUCT_STATUSES = ["development", "active", "deprecated"];
export const PRODUCT_STATUS_LABELS = {
  development: "Development",
  active: "Active",
  deprecated: "Deprecated",
};

export const ROADMAP_STATUSES = ["planned", "in_progress", "released"];
export const ROADMAP_STATUS_LABELS = {
  planned: "Planned",
  in_progress: "In Progress",
  released: "Released",
};

export const productsApi = {
  async list(params = {}) {
    const { data } = await api.get("/products", { params });
    return data; // { data: items, meta: { page, limit, total, ... } }
  },
  async categories() {
    const { data } = await api.get("/products/categories");
    return data.data.categories; // [{ key, label, builtIn }]
  },
  async addCategory(label) {
    const { data } = await api.post("/products/categories", { label });
    return data.data.category; // { key, label, builtIn }
  },
  async get(id) {
    const { data } = await api.get(`/products/${id}`);
    return data.data.product;
  },
  async create(payload) {
    const { data } = await api.post("/products", payload);
    return data.data.product;
  },
  async update(id, payload) {
    const { data } = await api.patch(`/products/${id}`, payload);
    return data.data.product;
  },
  async remove(id) {
    await api.delete(`/products/${id}`);
  },
  async addVersion(id, body) {
    const { data } = await api.post(`/products/${id}/versions`, body);
    return data.data.product;
  },
  async addRoadmapItem(id, body) {
    const { data } = await api.post(`/products/${id}/roadmap`, body);
    return data.data.product;
  },
  async updateRoadmapItem(id, itemId, body) {
    const { data } = await api.patch(`/products/${id}/roadmap/${itemId}`, body);
    return data.data.product;
  },
};
