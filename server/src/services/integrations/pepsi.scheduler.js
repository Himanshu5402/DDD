/**
 * PEPSI background sync scheduler.
 *
 * When PEPSI_SYNC_ENABLED=true, runs runPepsiSync() at boot and then every
 * PEPSI_SYNC_INTERVAL_MS. Disabled by default so nothing runs until the live
 * API is wired up. The timer is unref'd so it never blocks graceful shutdown.
 */
import env from '../../config/env.js';
import logger from '../../config/logger.js';
import User from '../../models/user.model.js';
import { runPepsiSync } from '../../modules/integrations/pepsi.sync.js';
import { broadcast } from '../../socket/index.js';

let timer = null;

async function tick() {
  try {
    const admin = await User.findOne({ email: env.SEED_ADMIN_EMAIL }).select('_id');
    const result = await runPepsiSync(admin?._id || null);
    logger.info(
      `PEPSI scheduled sync (${result.source}) → created ${result.created}, updated ${result.updated}.`
    );
    if (result.created || result.updated) {
      broadcast('rrrmas:changed', { type: 'pepsi:scheduled-sync', at: Date.now() });
    }
  } catch (err) {
    logger.error(`PEPSI scheduled sync failed: ${err.message}`);
  }
}

export function startPepsiScheduler() {
  if (!env.PEPSI_SYNC_ENABLED) {
    logger.info('PEPSI scheduler disabled (set PEPSI_SYNC_ENABLED=true to enable).');
    return;
  }
  const mins = Math.round(env.PEPSI_SYNC_INTERVAL_MS / 60000);
  logger.info(`PEPSI scheduler enabled — syncing at boot and every ${mins} min.`);
  tick(); // initial run
  timer = setInterval(tick, env.PEPSI_SYNC_INTERVAL_MS);
  if (timer.unref) timer.unref();
}

export function stopPepsiScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
