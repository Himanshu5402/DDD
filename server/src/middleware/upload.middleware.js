import multer from 'multer';
import ApiError from '../utils/ApiError.js';

/**
 * In-memory multipart upload. Buffers land in `req.files` and are handed to the
 * configured storage provider by the route handler — so switching local ↔
 * Cloudinary never touches upload code.
 */
const IMAGE_VIDEO = /^(image|video)\//;
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB per file

export const uploadReportMedia = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 10 },
  fileFilter: (_req, file, cb) => {
    if (IMAGE_VIDEO.test(file.mimetype)) return cb(null, true);
    return cb(ApiError.badRequest('Only image and video files are allowed'));
  },
}).array('files', 10);

/** Wrap multer so its errors become our ApiError envelope. */
export function handleUpload(mw) {
  return (req, res, next) =>
    mw(req, res, (err) => {
      if (!err) return next();
      if (err instanceof multer.MulterError) {
        const msg =
          err.code === 'LIMIT_FILE_SIZE'
            ? 'File too large (max 25 MB)'
            : err.code === 'LIMIT_FILE_COUNT'
              ? 'Too many files (max 10)'
              : err.message;
        return next(ApiError.badRequest(msg));
      }
      return next(err);
    });
}
