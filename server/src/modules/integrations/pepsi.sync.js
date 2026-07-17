/**
 * PEPSI sync orchestrator — pulls projects from the live API and upserts them,
 * falling back to the bundled snapshot when the API isn't configured or its
 * project endpoints aren't live yet.
 *
 * This is the single entry point for a server-initiated sync (scheduler +
 * `POST /integrations/pepsi/pull`). The push endpoint
 * (`POST /integrations/pepsi/sync`) still accepts an externally-supplied
 * payload directly.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import logger from '../../config/logger.js';
import { upsertPepsiProjects } from './pepsi.service.js';
import {
  fetchPepsiProjects,
  isPepsiApiConfigured,
  PepsiEndpointsNotReadyError,
} from '../../services/integrations/pepsi.client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = path.resolve(__dirname, '../../seed/pepsi.snapshot.json');

/** Read the bundled portal snapshot (the stand-in until the live API is ready). */
export function loadSnapshotProjects() {
  const snap = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));
  return snap.projects || [];
}

/**
 * Run a PEPSI sync. Returns `{ source: 'api' | 'snapshot', created, updated, total }`.
 *
 * @param {string} actorId  User id recorded as createdBy on first insert.
 * @param {object} [opts]
 * @param {boolean} [opts.allowSnapshotFallback=true]  Fall back to the snapshot on API failure.
 */
export async function runPepsiSync(actorId, { allowSnapshotFallback = true } = {}) {
  let projects;
  let source = 'snapshot';

  if (isPepsiApiConfigured()) {
    try {
      projects = await fetchPepsiProjects();
      source = 'api';
      logger.info(`PEPSI sync: fetched ${projects.length} project(s) from the live API.`);
    } catch (err) {
      if (err instanceof PepsiEndpointsNotReadyError) {
        logger.warn(`PEPSI sync: ${err.message} Falling back to snapshot.`);
      } else {
        logger.error(`PEPSI sync: live API fetch failed — ${err.message}.`);
      }
      if (!allowSnapshotFallback) throw err;
      projects = loadSnapshotProjects();
    }
  } else {
    projects = loadSnapshotProjects();
  }

  const result = await upsertPepsiProjects(projects, actorId);
  return { source, ...result };
}
