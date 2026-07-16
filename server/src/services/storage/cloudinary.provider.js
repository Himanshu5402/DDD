import { StorageProvider } from './storage.interface.js';
import env from '../../config/env.js';

/**
 * Cloudinary provider. The SDK is lazy-loaded so the app boots even when
 * `cloudinary` isn't installed / configured (it's an optional dependency).
 */
export class CloudinaryStorageProvider extends StorageProvider {
  #cloudinary = null;

  get name() {
    return 'cloudinary';
  }

  async #client() {
    if (this.#cloudinary) return this.#cloudinary;
    let mod;
    try {
      mod = await import('cloudinary');
    } catch {
      throw new Error(
        "STORAGE_PROVIDER=cloudinary but the 'cloudinary' package is not installed. Run: npm i cloudinary -w server"
      );
    }
    const cloudinary = mod.v2 || mod.default?.v2 || mod.default;
    if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
      throw new Error('Cloudinary is selected but CLOUDINARY_* env vars are missing.');
    }
    cloudinary.config({
      cloud_name: env.CLOUDINARY_CLOUD_NAME,
      api_key: env.CLOUDINARY_API_KEY,
      api_secret: env.CLOUDINARY_API_SECRET,
    });
    this.#cloudinary = cloudinary;
    return cloudinary;
  }

  async save(buffer, { originalName = 'file', mimeType, folder = 'general' } = {}) {
    const cloudinary = await this.#client();
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: `itsybizzz/${folder}`, resource_type: 'auto' },
        (err, res) => (err ? reject(err) : resolve(res))
      );
      stream.end(buffer);
    });
    return {
      key: result.public_id,
      url: result.secure_url,
      provider: this.name,
      size: result.bytes,
      mimeType,
      originalName,
    };
  }

  async remove(key) {
    const cloudinary = await this.#client();
    await cloudinary.uploader.destroy(key, { resource_type: 'image' }).catch(() => {});
  }

  async getUrl(key) {
    const cloudinary = await this.#client();
    return cloudinary.url(key, { secure: true });
  }
}
