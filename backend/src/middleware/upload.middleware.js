import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import config from '../config/index.js';
import ApiError from '../utils/ApiError.js';

// Ensure the upload directory exists at startup.
fs.mkdirSync(config.uploads.dir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, config.uploads.dir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeBase = path
      .basename(file.originalname, ext)
      .replace(/[^a-z0-9_-]/gi, '_')
      .slice(0, 40);
    const unique = crypto.randomBytes(8).toString('hex');
    cb(null, `${Date.now()}-${unique}-${safeBase}${ext}`);
  },
});

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/postscript', // .ai / .eps
  'image/vnd.adobe.photoshop', // .psd
  'application/octet-stream',
]);

function fileFilter(_req, file, cb) {
  if (ALLOWED_MIME.has(file.mimetype)) return cb(null, true);
  return cb(ApiError.badRequest(`Unsupported file type: ${file.mimetype}`));
}

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: config.uploads.maxFileSizeBytes },
});

/** Relative path stored in the DB (portable across environments). */
export function toStoredPath(file) {
  if (!file) return null;
  return path.posix.join('uploads', path.basename(file.path));
}
