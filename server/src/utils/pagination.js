/**
 * Parse standard list query params into normalized pagination + sort options.
 *
 *   ?page=2&limit=20&sort=-createdAt
 */
export function parsePagination(query = {}, { defaultLimit = 20, maxLimit = 100 } = {}) {
  let page = parseInt(query.page, 10);
  let limit = parseInt(query.limit, 10);

  page = Number.isFinite(page) && page > 0 ? page : 1;
  limit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, maxLimit) : defaultLimit;

  const skip = (page - 1) * limit;

  // sort: "field" (asc) or "-field" (desc), comma-separated for multiple.
  let sort = { createdAt: -1 };
  if (typeof query.sort === 'string' && query.sort.trim()) {
    sort = query.sort
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .reduce((acc, field) => {
        if (field.startsWith('-')) acc[field.slice(1)] = -1;
        else acc[field] = 1;
        return acc;
      }, {});
  }

  return { page, limit, skip, sort };
}
