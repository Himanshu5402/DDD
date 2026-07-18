import asyncHandler from '../../utils/asyncHandler.js';
import ApiResponse from '../../utils/ApiResponse.js';
import ApiError from '../../utils/ApiError.js';
import { broadcast } from '../../socket/index.js';
import { getStorage } from '../../services/storage/index.js';
import * as service from './reporting.service.js';

/** Notify connected clients that reports changed so they can refetch. */
function emitChange(type, id) {
  broadcast('reports:changed', { type, id: String(id), at: Date.now() });
}

export const submit = asyncHandler(async (req, res) => {
  const { report, created } = await service.submitReport(req.body, req.user);
  emitChange(created ? 'created' : 'updated', report._id);
  if (created) return ApiResponse.created(res, { report }, 'Report submitted');
  return ApiResponse.ok(res, { report }, 'Report updated');
});

export const mine = asyncHandler(async (req, res) => {
  const { items, page, limit, total } = await service.listMine(req.query, req.user);
  return ApiResponse.paginated(res, items, { page, limit, total }, 'My reports');
});

export const team = asyncHandler(async (req, res) => {
  const data = await service.getTeamReports(req.query, req.user, {
    permissions: req.permissions,
    isSuperAdmin: req.isSuperAdmin,
  });
  return ApiResponse.ok(res, data, 'Team reports');
});

export const getOne = asyncHandler(async (req, res) => {
  const report = await service.getReport(req.params.id, req.user, {
    permissions: req.permissions,
    isSuperAdmin: req.isSuperAdmin,
  });
  return ApiResponse.ok(res, { report }, 'Report');
});

export const approve = asyncHandler(async (req, res) => {
  const report = await service.decideReport(
    req.params.id,
    { decision: 'approved' },
    req.user,
    { isSuperAdmin: req.isSuperAdmin }
  );
  emitChange('approved', report._id);
  return ApiResponse.ok(res, { report }, 'Report approved');
});

export const reject = asyncHandler(async (req, res) => {
  const report = await service.decideReport(
    req.params.id,
    { decision: 'rejected', reason: req.body.reason },
    req.user,
    { isSuperAdmin: req.isSuperAdmin }
  );
  emitChange('rejected', report._id);
  return ApiResponse.ok(res, { report }, 'Report returned');
});

export const aiSummary = asyncHandler(async (req, res) => {
  const result = await service.aiSummary(req.params.id, req.user, {
    permissions: req.permissions,
    isSuperAdmin: req.isSuperAdmin,
  });
  return ApiResponse.ok(res, result, 'AI summary');
});

export const digest = asyncHandler(async (req, res) => {
  const result = await service.teamDigest(req.body);
  return ApiResponse.ok(res, result, 'Team digest');
});

/** Store uploaded photos/videos and return attachment metadata for the report. */
export const upload = asyncHandler(async (req, res) => {
  const files = req.files || [];
  if (!files.length) throw ApiError.badRequest('No files uploaded');

  const storage = getStorage();
  const attachments = await Promise.all(
    files.map(async (f) => {
      const stored = await storage.save(f.buffer, {
        originalName: f.originalname,
        mimeType: f.mimetype,
        folder: 'reports',
      });
      return {
        url: stored.url,
        key: stored.key,
        type: f.mimetype.startsWith('video') ? 'video' : 'image',
        name: f.originalname,
        size: stored.size,
        mimeType: f.mimetype,
      };
    })
  );

  return ApiResponse.created(res, { attachments }, 'Files uploaded');
});
