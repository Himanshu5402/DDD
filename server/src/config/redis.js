import env from './env.js';
import logger from './logger.js';

/**
 * Redis is OPTIONAL. It powers caching and BullMQ background jobs. When
 * REDIS_URL is unset (typical in local dev) the app runs fine without it —
 * callers must handle a null client and degrade gracefully.
 */
let client = null;
let attempted = false;

export async function getRedis() {
  if (attempted) return client;
  attempted = true;

  if (!env.REDIS_URL) {
    logger.warn('REDIS_URL not set — Redis features (cache, queues) are disabled.');
    return null;
  }

  try {
    const { default: IORedis } = await import('ioredis');
    client = new IORedis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });
    client.on('error', (err) => logger.error(`Redis error: ${err.message}`));
    await client.connect();
    logger.info('Redis connected');
    return client;
  } catch (err) {
    logger.error(`Redis unavailable (${err.message}). Continuing without it.`);
    client = null;
    return null;
  }
}

export async function closeRedis() {
  if (client) {
    await client.quit().catch(() => {});
    client = null;
  }
}

export function redisEnabled() {
  return Boolean(client);
}
