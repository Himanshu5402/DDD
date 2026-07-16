/**
 * Load the PEPSI portal snapshot into the configured database.
 *   npm run seed:pepsi -w server
 *
 * Idempotent — upserts by externalId, so re-running just refreshes the data.
 * When the PEPSI API exists this script is superseded by POST /integrations/pepsi/sync.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import env from '../config/env.js';
import logger from '../config/logger.js';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import User from '../models/user.model.js';
import { upsertPepsiProjects } from '../modules/integrations/pepsi.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

(async () => {
  try {
    await connectDatabase();

    const admin = await User.findOne({ email: env.SEED_ADMIN_EMAIL });
    if (!admin) {
      throw new Error(`Seed admin ${env.SEED_ADMIN_EMAIL} not found — run \`npm run seed\` first.`);
    }

    const snapshot = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'pepsi.snapshot.json'), 'utf8')
    );

    const result = await upsertPepsiProjects(snapshot.projects, admin._id);
    logger.info(
      `PEPSI snapshot loaded → created ${result.created}, updated ${result.updated} (of ${snapshot.projects.length})`
    );

    await disconnectDatabase();
    process.exit(0);
  } catch (err) {
    logger.error(`PEPSI seed failed: ${err.stack || err.message}`);
    process.exit(1);
  }
})();
