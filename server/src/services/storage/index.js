import env from '../../config/env.js';
import logger from '../../config/logger.js';
import { LocalStorageProvider } from './local.provider.js';
import { CloudinaryStorageProvider } from './cloudinary.provider.js';

/**
 * Storage provider factory. Selects the provider from STORAGE_PROVIDER and
 * exposes a single shared instance. Swapping providers is a config change —
 * no application code changes required.
 */
let instance = null;

export function getStorage() {
  if (instance) return instance;
  switch (env.STORAGE_PROVIDER) {
    case 'cloudinary':
      instance = new CloudinaryStorageProvider();
      break;
    case 'local':
    default:
      instance = new LocalStorageProvider();
      break;
  }
  logger.info(`Storage provider: ${instance.name}`);
  return instance;
}

export { LocalStorageProvider };
