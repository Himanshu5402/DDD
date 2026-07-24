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

// Single data file for the bulk form import (/import/parse).
const IMPORT_FILE_RX = /\.(xlsx|xls|csv|pdf)$/i;

export const uploadImportFile = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (IMPORT_FILE_RX.test(file.originalname)) return cb(null, true);
    return cb(ApiError.badRequest('Only .xlsx, .xls, .csv or .pdf files are allowed'));
  },
}).single('file');

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
