import mongoose from 'mongoose';
import env, { isProd } from './env.js';
import logger from './logger.js';

let memoryServer = null;

/**
 * Connect to MongoDB.
 *
 * Resolution order:
 *   1. If MONGODB_URI is set → use it.
 *   2. Else if USE_MEMORY_DB (and not production) → spin up an in-memory
 *      MongoDB via mongodb-memory-server (zero local install required).
 *   3. Else → error (production must provide a real URI).
 */
export async function connectDatabase() {
  mongoose.set('strictQuery', true);

  let uri = env.MONGODB_URI;

  if (!uri) {
    if (env.USE_MEMORY_DB && !isProd) {
      const { MongoMemoryServer } = await import('mongodb-memory-server');
      memoryServer = await MongoMemoryServer.create();
      uri = memoryServer.getUri('itsybizzz');
      logger.warn('Using in-memory MongoDB (dev only). Data is NOT persisted across restarts.');
    } else {
      throw new Error(
        'No MONGODB_URI provided. Set MONGODB_URI, or enable USE_MEMORY_DB in non-production.'
      );
    }
  }

  mongoose.connection.on('connected', () => logger.info('MongoDB connected'));
  mongoose.connection.on('error', (err) => logger.error(`MongoDB error: ${err.message}`));
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000,
    autoIndex: !isProd, // build indexes automatically in dev; do it explicitly in prod
  });

  return mongoose.connection;
}

export async function disconnectDatabase() {
  await mongoose.connection.close();
  if (memoryServer) {
    await memoryServer.stop();
    memoryServer = null;
  }
}

export function isMemoryDb() {
  return Boolean(memoryServer);
}
