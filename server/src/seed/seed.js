/**
 * CLI seeder: `npm run seed`.
 * Connects to the configured MongoDB, seeds core RBAC + admin, then exits.
 * NOTE: with the in-memory dev DB this is a no-op across processes — in that
 * mode the server seeds itself on boot (see src/index.js).
 */
import { connectDatabase, disconnectDatabase, isMemoryDb } from '../config/database.js';
import { seedAll } from './seed.core.js';
import logger from '../config/logger.js';

(async () => {
  try {
    await connectDatabase();

    if (isMemoryDb()) {
      logger.warn(
        'Seeding an in-memory DB from the CLI has no lasting effect (ephemeral per process). ' +
          'Set MONGODB_URI to seed a persistent database, or just start the server — it self-seeds in memory mode.'
      );
    }

    const result = await seedAll();
    logger.info(
      `Seed complete → ${result.permissions} permissions, ${result.roles} roles, admin: ${result.adminEmail}`
    );
    await disconnectDatabase();
    process.exit(0);
  } catch (err) {
    logger.error(`Seed failed: ${err.stack || err.message}`);
    process.exit(1);
  }
})();
