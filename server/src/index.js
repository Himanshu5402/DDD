import http from 'node:http';
import env from './config/env.js';
import logger from './config/logger.js';
import { connectDatabase, disconnectDatabase, isMemoryDb } from './config/database.js';
import { getRedis, closeRedis } from './config/redis.js';
import { createApp } from './app.js';
import { initSocket } from './socket/index.js';
import { seedAll } from './seed/seed.core.js';
import { startPepsiScheduler, stopPepsiScheduler } from './services/integrations/pepsi.scheduler.js';
import { startExpiryScheduler, stopExpiryScheduler } from './services/maintenance/expiry.scheduler.js';

let server;

async function bootstrap() {
  await connectDatabase();

  // The in-memory dev DB is ephemeral per process — auto-seed so there's an
  // admin to log in with immediately. Real DBs are seeded via `npm run seed`.
  if (isMemoryDb()) {
    const result = await seedAll();
    logger.info(`Auto-seeded in-memory DB → admin: ${result.adminEmail} / (see SEED_ADMIN_PASSWORD)`);
  }

  await getRedis(); // optional; warns and continues if unavailable

  const app = createApp();
  server = http.createServer(app);
  initSocket(server);

  server.listen(env.PORT, () => {
    logger.info(`🚀 ITSYBIZZ API listening on http://localhost:${env.PORT}${env.API_PREFIX}`);
    logger.info(`📚 API docs at http://localhost:${env.PORT}/api/docs`);
    startPepsiScheduler(); // PEPSI project sync (no-op unless PEPSI_SYNC_ENABLED)
    startExpiryScheduler(); // bills/renewals expiry reminders → admin notifications
  });
}

async function shutdown(signal) {
  logger.info(`${signal} received — shutting down gracefully...`);
  try {
    stopPepsiScheduler();
    stopExpiryScheduler();
    if (server) await new Promise((resolve) => server.close(resolve));
    await closeRedis();
    await disconnectDatabase();
    logger.info('Shutdown complete.');
    process.exit(0);
  } catch (err) {
    logger.error(`Error during shutdown: ${err.message}`);
    process.exit(1);
  }
}

['SIGINT', 'SIGTERM'].forEach((sig) => process.on(sig, () => shutdown(sig)));

process.on('unhandledRejection', (reason) => {
  logger.error(`Unhandled rejection: ${reason?.stack || reason}`);
});
process.on('uncaughtException', (err) => {
  logger.error(`Uncaught exception: ${err.stack || err.message}`);
  process.exit(1);
});

bootstrap().catch((err) => {
  logger.error(`Failed to start server: ${err.stack || err.message}`);
  process.exit(1);
});
