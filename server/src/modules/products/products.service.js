import mongoose from 'mongoose';
import Product, { PRODUCT_CATEGORIES } from '../../models/product.model.js';
import ProductCategory from '../../models/productCategory.model.js';
import ApiError from '../../utils/ApiError.js';
import { parsePagination } from '../../utils/pagination.js';
import { validateValues as validateCustomFields } from '../customFields/customFields.service.js';

const ENTITY = 'product';

const LIST_POPULATE = [{ path: 'createdBy', select: 'name email avatar' }];

const DETAIL_POPULATE = [{ path: 'createdBy', select: 'name email avatar' }];

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Build the Mongo filter for the product list. */
function buildFilter(query = {}) {
  const filter = {};

  if (query.category) filter.category = query.category;
  if (query.status) filter.status = query.status;
  if (query.tag) filter.tags = query.tag;

  if (query.search) {
    const rx = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = [{ name: rx }, { sku: rx }, { description: rx }];
  }

  return filter;
}

/** Throw 409 if another product already uses this SKU. */
async function assertSkuAvailable(sku, excludeId) {
  const normalized = String(sku).trim().toUpperCase();
  if (!normalized) return undefined;
  const filter = { sku: normalized };
  if (excludeId) filter._id = { $ne: excludeId };
  const exists = await Product.findOne(filter).select('_id');
  if (exists) throw ApiError.conflict(`A product with SKU "${normalized}" already exists`);
  return normalized;
}

export async function listProducts(query) {
  const { page, limit, skip, sort } = parsePagination(query, { defaultLimit: 25 });
  const filter = buildFilter(query);

  const [items, total] = await Promise.all([
    Product.find(filter).populate(LIST_POPULATE).sort(sort).skip(skip).limit(limit),
    Product.countDocuments(filter),
  ]);
  return { items, page, limit, total };
}

export async function getProduct(id) {
  const product = await Product.findById(id).populate(DETAIL_POPULATE);
  if (!product) throw ApiError.notFound('Product not found');
  return product;
}

// ---------------------------------------------------------------------------
// Categories — open set: built-in defaults + admin-added ProductCategory rows.

const BUILT_IN_LABELS = Object.freeze({
  other: 'Other',
});

const slugifyCategory = (label) =>
  String(label).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);

const titleize = (key) =>
  key.split('_').filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

/** Built-ins + custom rows + anything already used on a product, deduped; 'Other' last. */
export async function listCategories() {
  const [custom, used] = await Promise.all([
    ProductCategory.find().lean(),
    Product.distinct('category'),
  ]);
  const map = new Map();
  for (const k of PRODUCT_CATEGORIES) map.set(k, { key: k, label: BUILT_IN_LABELS[k] || titleize(k), builtIn: true });
  for (const c of custom) map.set(c.key, { key: c.key, label: c.label, builtIn: false });
  for (const k of used) if (k && !map.has(k)) map.set(k, { key: k, label: titleize(k), builtIn: false });
  return [...map.values()].sort(
    (a, b) => (a.key === 'other') - (b.key === 'other') || a.label.localeCompare(b.label)
  );
}

/** Explicit "Add category" — idempotent on the slugified key. */
export async function addCategory(label, userId) {
  const key = slugifyCategory(label);
  if (!key) throw ApiError.badRequest('Invalid category name');
  if (PRODUCT_CATEGORIES.includes(key)) {
    return { key, label: BUILT_IN_LABELS[key] || titleize(key), builtIn: true };
  }
  const doc = await ProductCategory.findOneAndUpdate(
    { key },
    { $setOnInsert: { key, label: String(label).trim(), createdBy: userId || null } },
    { upsert: true, new: true }
  ).lean();
  return { key: doc.key, label: doc.label, builtIn: false };
}

/** Auto-register unknown categories on product save so they appear in dropdowns next time. */
async function ensureCategory(category, userId) {
  if (!category) return undefined;
  const key = slugifyCategory(category);
  if (!key) return 'other';
  if (!PRODUCT_CATEGORIES.includes(key)) {
    await ProductCategory.updateOne(
      { key },
      { $setOnInsert: { key, label: titleize(key), createdBy: userId || null } },
      { upsert: true }
    );
  }
  return key;
}

export async function createProduct(data, user) {
  const sku = data.sku ? await assertSkuAvailable(data.sku) : undefined;
  if (data.category !== undefined) data.category = await ensureCategory(data.category, user?._id);

  const customFields = data.customFields
    ? await validateCustomFields(ENTITY, data.customFields)
    : {};

  const product = await Product.create({
    ...data,
    sku,
    customFields,
    createdBy: user._id,
  });

  return Product.findById(product._id).populate(LIST_POPULATE);
}

const UPDATABLE = [
  'name',
  'description',
  'category',
  'status',
  'currentVersion',
  'versions',
  'specs',
  'docsUrl',
  'trainingUrl',
  'supportNotes',
  'price',
  'currency',
  'upgradeRoadmap',
  'tags',
];

export async function updateProduct(id, data) {
  const product = await Product.findById(id);
  if (!product) throw ApiError.notFound('Product not found');

  if (data.category !== undefined) data.category = await ensureCategory(data.category);

  if (data.sku !== undefined) {
    if (data.sku === null || data.sku === '') {
      product.sku = undefined;
    } else {
      product.sku = await assertSkuAvailable(data.sku, product._id);
    }
  }

  for (const f of UPDATABLE) if (data[f] !== undefined) product[f] = data[f];

  if (data.customFields !== undefined) {
    const merged = { ...product.customFields, ...data.customFields };
    product.customFields = await validateCustomFields(ENTITY, merged, { partial: true });
  }

  await product.save();
  return Product.findById(product._id).populate(LIST_POPULATE);
}

/** Release a new version: append to versions and make it current. */
export async function addVersion(id, { version, notes }) {
  const product = await Product.findById(id);
  if (!product) throw ApiError.notFound('Product not found');

  product.versions.push({ version, notes: notes || '', releasedAt: new Date() });
  product.currentVersion = version;

  await product.save();
  return Product.findById(product._id).populate(LIST_POPULATE);
}

/** Add an upgrade roadmap item (starts as 'planned'). */
export async function addRoadmapItem(id, { title, plannedFor }) {
  const product = await Product.findById(id);
  if (!product) throw ApiError.notFound('Product not found');

  product.upgradeRoadmap.push({ title, plannedFor: plannedFor || '', status: 'planned' });

  await product.save();
  return Product.findById(product._id).populate(LIST_POPULATE);
}

/** Update the status of a roadmap item (planned → in_progress → released). */
export async function updateRoadmapItem(id, itemId, { status }) {
  const product = await Product.findById(id);
  if (!product) throw ApiError.notFound('Product not found');

  const item = product.upgradeRoadmap.id(itemId);
  if (!item) throw ApiError.notFound('Roadmap item not found');
  item.status = status;

  await product.save();
  return Product.findById(product._id).populate(LIST_POPULATE);
}

export async function deleteProduct(id) {
  const product = await Product.findById(id);
  if (!product) throw ApiError.notFound('Product not found');
  await product.deleteOne();
  return { success: true };
}

export function isValidObjectId(id) {
  return mongoose.isValidObjectId(id);
}
