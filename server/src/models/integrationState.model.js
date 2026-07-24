import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * One row per integration ('hrms', …) — durable sync bookkeeping so the owner
 * console's "last synced" survives server restarts (it used to be in-memory
 * only, which showed "Never synced" after every restart).
 */
const integrationStateSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    lastSyncAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.model('IntegrationState', integrationStateSchema);
