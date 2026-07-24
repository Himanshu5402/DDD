import asyncHandler from '../../utils/asyncHandler.js';
import ApiResponse from '../../utils/ApiResponse.js';
import ApiError from '../../utils/ApiError.js';
import { parseImportFile } from './import.service.js';

/**
 * POST /import/parse — multipart {file, entity?, fields?}.
 * Read-only: returns {columns, rows, meta} for the client-side preview; the
 * client saves accepted rows through the target module's own create endpoint.
 */
export const parse = asyncHandler(async (req, res) => {
  if (!req.file) throw ApiError.badRequest('No file uploaded (multipart field name: "file")');

  let fields = [];
  if (req.body.fields) {
    try {
      const parsed = JSON.parse(req.body.fields);
      if (Array.isArray(parsed)) {
        fields = parsed
          .filter((f) => f && typeof f.key === 'string')
          .map((f) => ({ key: f.key, label: f.label || f.key, hint: f.hint || '' }))
          .slice(0, 60);
      }
    } catch {
      /* malformed fields hint — ignore, parsing works without it */
    }
  }

  const result = await parseImportFile(req.file, {
    entity: String(req.body.entity || 'records').slice(0, 80),
    fields,
  });
  return ApiResponse.ok(res, result, 'File parsed');
});
