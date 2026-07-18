/**
 * Expiry-reminder background scheduler.
 *
 * When EXPIRY_REMINDERS_ENABLED (default true), runs the reminder sweep at boot
 * and then every EXPIRY_REMINDER_INTERVAL_MS. The sweep notifies admins (and the
 * item owner) about bills/renewals entering a new reminder stage — "1 day left",
 * "expires today", "overdue" — firing each stage at most once per cycle. The
 * timer is unref'd so it never blocks graceful shutdown.
 */
import env from '../../config/env.js';
import logger from '../../config/logger.js';
import { runReminderSweep } from '../../modules/maintenance/expiries.service.js';
import { runMaintenanceReminderSweep } from '../../modules/maintenance/records.service.js';

let timer = null;

async function tick() {
  try {
    const [bills, maintenance] = await Promise.all([
      runReminderSweep(),
      runMaintenanceReminderSweep(),
    ]);
    if (bills.notified > 0 || maintenance.notified > 0) {
      logger.info(`Reminders → bills sent ${bills.notified}, maintenance sent ${maintenance.notified}.`);
    }
  } catch (err) {
    logger.error(`Reminder sweep failed: ${err.message}`);
  }
}

export function startExpiryScheduler() {
  if (!env.EXPIRY_REMINDERS_ENABLED) {
    logger.info('Expiry reminder scheduler disabled (set EXPIRY_REMINDERS_ENABLED=true to enable).');
    return;
  }
  const mins = Math.round(env.EXPIRY_REMINDER_INTERVAL_MS / 60000);
  logger.info(`Expiry reminder scheduler enabled — sweeping at boot and every ${mins} min.`);
  tick(); // initial run
  timer = setInterval(tick, env.EXPIRY_REMINDER_INTERVAL_MS);
  if (timer.unref) timer.unref();
}

export function stopExpiryScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
