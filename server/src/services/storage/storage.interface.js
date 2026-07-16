/**
 * Storage provider contract. Every provider (local, Cloudinary, S3, Azure…)
 * implements this shape so the rest of the app never depends on a vendor.
 *
 * @typedef {Object} StoredFile
 * @property {string} key        Provider-specific identifier (path or public_id)
 * @property {string} url        Publicly resolvable (or signed) URL
 * @property {string} provider   Provider name
 * @property {number} [size]     Bytes
 * @property {string} [mimeType]
 * @property {string} [originalName]
 */

export class StorageProvider {
  /** @returns {string} provider name */
  get name() {
    throw new Error('not implemented');
  }

  /**
   * Persist a buffer.
   * @param {Buffer} _buffer
   * @param {{ originalName?: string, mimeType?: string, folder?: string }} _opts
   * @returns {Promise<StoredFile>}
   */
  async save(_buffer, _opts) {
    throw new Error('not implemented');
  }

  /** Remove a previously stored file by key. @returns {Promise<void>} */
  async remove(_key) {
    throw new Error('not implemented');
  }

  /** Resolve a (possibly signed) URL for a key. @returns {Promise<string>} */
  async getUrl(key) {
    return key;
  }
}
