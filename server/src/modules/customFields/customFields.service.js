import CustomFieldDefinition from '../../models/customField.model.js';
import ApiError from '../../utils/ApiError.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^https?:\/\/.+/i;

/** List custom-field definitions for an entity type (active first, ordered). */
export async function listDefinitions(entityType, { includeInactive = false } = {}) {
  const filter = { entityType: entityType.toLowerCase() };
  if (!includeInactive) filter.isActive = true;
  return CustomFieldDefinition.find(filter).sort({ order: 1, createdAt: 1 });
}

export async function createDefinition(data, userId) {
  const exists = await CustomFieldDefinition.findOne({
    entityType: data.entityType.toLowerCase(),
    key: data.key,
  });
  if (exists) throw ApiError.conflict(`A custom field "${data.key}" already exists for ${data.entityType}`);

  return CustomFieldDefinition.create({ ...data, createdBy: userId });
}

export async function updateDefinition(id, data) {
  const def = await CustomFieldDefinition.findById(id);
  if (!def) throw ApiError.notFound('Custom field not found');
  // Key + entityType are immutable once created (they anchor stored data).
  const { key, entityType, ...rest } = data;
  Object.assign(def, rest);
  await def.save();
  return def;
}

export async function deleteDefinition(id) {
  const def = await CustomFieldDefinition.findByIdAndDelete(id);
  if (!def) throw ApiError.notFound('Custom field not found');
  return { success: true };
}

/**
 * Validate + coerce a `customFields` values object against the active
 * definitions for an entity type.
 *
 * @param {string} entityType
 * @param {Object} values
 * @param {{ partial?: boolean }} opts  partial=true skips required checks (for PATCH)
 * @returns {Promise<Object>} cleaned values (only known, valid keys)
 */
export async function validateValues(entityType, values = {}, { partial = false } = {}) {
  const defs = await listDefinitions(entityType);
  if (!defs.length) return {};

  const cleaned = {};
  const errors = [];

  for (const def of defs) {
    const provided = Object.prototype.hasOwnProperty.call(values, def.key);
    let value = provided ? values[def.key] : undefined;

    // Apply default when nothing provided on a full validation.
    if (!provided && !partial && def.defaultValue != null) value = def.defaultValue;

    const isEmpty = value === undefined || value === null || value === '';

    if (isEmpty) {
      if (def.required && !partial) errors.push({ path: def.key, message: `${def.label} is required` });
      continue;
    }

    try {
      cleaned[def.key] = coerceAndValidate(def, value);
    } catch (err) {
      errors.push({ path: def.key, message: err.message });
    }
  }

  if (errors.length) {
    throw ApiError.unprocessable('Custom field validation failed', { details: errors });
  }
  return cleaned;
}

function coerceAndValidate(def, value) {
  const v = def.validation || {};
  switch (def.type) {
    case 'text':
    case 'textarea': {
      const s = String(value);
      if (v.minLength != null && s.length < v.minLength) throw new Error(`${def.label} is too short`);
      if (v.maxLength != null && s.length > v.maxLength) throw new Error(`${def.label} is too long`);
      if (v.pattern && !new RegExp(v.pattern).test(s)) throw new Error(`${def.label} has an invalid format`);
      return s;
    }
    case 'email': {
      const s = String(value).trim().toLowerCase();
      if (!EMAIL_RE.test(s)) throw new Error(`${def.label} must be a valid email`);
      return s;
    }
    case 'url': {
      const s = String(value).trim();
      if (!URL_RE.test(s)) throw new Error(`${def.label} must be a valid URL`);
      return s;
    }
    case 'number': {
      const n = Number(value);
      if (Number.isNaN(n)) throw new Error(`${def.label} must be a number`);
      if (v.min != null && n < v.min) throw new Error(`${def.label} must be ≥ ${v.min}`);
      if (v.max != null && n > v.max) throw new Error(`${def.label} must be ≤ ${v.max}`);
      return n;
    }
    case 'boolean':
      return value === true || value === 'true' || value === 1 || value === '1';
    case 'date': {
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) throw new Error(`${def.label} must be a valid date`);
      return d;
    }
    case 'select': {
      const allowed = def.options.map((o) => o.value);
      if (!allowed.includes(String(value))) throw new Error(`${def.label} has an invalid option`);
      return String(value);
    }
    case 'multiselect': {
      const arr = Array.isArray(value) ? value.map(String) : [String(value)];
      const allowed = new Set(def.options.map((o) => o.value));
      for (const item of arr) if (!allowed.has(item)) throw new Error(`${def.label} has an invalid option "${item}"`);
      return arr;
    }
    default:
      return value;
  }
}
