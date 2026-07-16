/**
 * Uniform success envelope so every module returns the same JSON shape:
 *   { success, message, data, meta }
 */
export default class ApiResponse {
  constructor(data = null, message = 'OK', meta = undefined) {
    this.success = true;
    this.message = message;
    this.data = data;
    if (meta !== undefined) this.meta = meta;
  }

  /** Send an ApiResponse with the given HTTP status. */
  static send(res, statusCode, data, message, meta) {
    return res.status(statusCode).json(new ApiResponse(data, message, meta));
  }

  static ok(res, data, message = 'OK', meta) {
    return ApiResponse.send(res, 200, data, message, meta);
  }

  static created(res, data, message = 'Created') {
    return ApiResponse.send(res, 201, data, message);
  }

  static noContent(res) {
    return res.status(204).send();
  }

  /** Paginated list response with standard meta. */
  static paginated(res, items, { page, limit, total }, message = 'OK') {
    const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;
    return ApiResponse.send(res, 200, items, message, {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    });
  }
}
