import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { StorageProvider } from './storage.interface.js';
import env from '../../config/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Files land in server/<STORAGE_LOCAL_DIR> and are served at /uploads.
const ROOT = path.resolve(__dirname, '../../../', env.STORAGE_LOCAL_DIR);

export class LocalStorageProvider extends StorageProvider {
  get name() {
    return 'local';
  }

  /** Absolute filesystem root where files are written. */
  static get root() {
    return ROOT;
  }

  async save(buffer, { originalName = 'file', mimeType, folder = 'general' } = {}) {
    const ext = path.extname(originalName);
    const safeFolder = String(folder).replace(/[^a-z0-9/_-]/gi, '');
    const dir = path.join(ROOT, safeFolder);
    await fs.mkdir(dir, { recursive: true });

    const filename = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
    const abs = path.join(dir, filename);
    await fs.writeFile(abs, buffer);

    const key = path.posix.join(safeFolder, filename);
    return {
      key,
      url: `/uploads/${key}`,
      provider: this.name,
      size: buffer.length,
      mimeType,
      originalName,
    };
  }

  async remove(key) {
    const abs = path.join(ROOT, key);
    // Guard against path traversal outside ROOT.
    if (!abs.startsWith(ROOT)) return;
    await fs.rm(abs, { force: true });
  }

  async getUrl(key) {
    return `/uploads/${key}`;
  }
}
