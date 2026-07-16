import mongoose from 'mongoose';

const { Schema } = mongoose;

export const PROJECT_STATUSES = Object.freeze([
  'planning',
  'active',
  'on_hold',
  'completed',
  'cancelled',
]);

export const PROJECT_SOURCES = Object.freeze(['manual', 'pepsi']);
export const PROJECT_HEALTH = Object.freeze(['on_track', 'at_risk', 'critical', '']);
export const PROJECT_WORK_TYPES = Object.freeze(['HW', 'SW', 'HW+SW', '']);
export const MILESTONE_STATUSES = Object.freeze(['done', 'active', 'in_progress', 'planned', 'pending']);

// PEPSI portal's 8-stage execution cycle (source of truth for stage names).
export const PEPSI_STAGES = Object.freeze([
  'Initiation & Planning',
  'Hardware Procurement & Mapping',
  'Software Development',
  'Hardware QA & FAT',
  'Software QA & Validation',
  'On-Ground Production Testing',
  'Adhoc Requirements & Execution',
  'Project Completion & Handover',
]);

const projectSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },

    // Loose cross-module link by ref name only (module built separately).
    customer: { type: Schema.Types.ObjectId, ref: 'Contact', default: null, index: true },

    status: { type: String, enum: PROJECT_STATUSES, default: 'planning', index: true },

    startDate: { type: Date },
    endDate: { type: Date },
    budget: { type: Number, min: 0 },

    manager: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    team: [{ type: Schema.Types.ObjectId, ref: 'User' }],

    progress: { type: Number, min: 0, max: 100, default: 0 },

    tags: [{ type: String, trim: true }],

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // Dynamic admin-defined fields (entityType 'project').
    customFields: { type: Schema.Types.Mixed, default: {} },

    // ------------------------------------------------------------------
    // Integration fields — projects synced from the PEPSI execution portal
    // (source of truth). Synced projects are read-only in DDD; upserts key
    // on `externalId` so repeated syncs never duplicate.
    // ------------------------------------------------------------------
    source: { type: String, enum: PROJECT_SOURCES, default: 'manual', index: true },
    externalId: { type: String, unique: true, sparse: true, trim: true }, // e.g. PRJ-2601
    code: { type: String, default: '', trim: true },
    workType: { type: String, enum: PROJECT_WORK_TYPES, default: '' }, // HW / SW / HW+SW
    contractValue: { type: Number, min: 0 }, // ₹, the project's contract/quotation value
    health: { type: String, enum: PROJECT_HEALTH, default: '' },
    spi: { type: Number }, // schedule performance index
    cpi: { type: Number }, // cost performance index
    currentStage: {
      index: { type: Number, min: 0 },
      total: { type: Number, default: 8 },
      name: { type: String, default: '' },
    },
    pmName: { type: String, default: '' }, // portal-side PM (external person)
    customerName: { type: String, default: '' }, // portal-side customer display name
    location: { type: String, default: '' },
    statusNote: { type: String, default: '' },
    insightNote: { type: String, default: '' }, // PEPSI predictive insight
    milestones: [
      {
        name: { type: String, required: true },
        date: { type: Date },
        status: { type: String, enum: MILESTONE_STATUSES, default: 'pending' },
      },
    ],
    budgetLines: [
      {
        category: { type: String, required: true },
        budget: { type: Number, min: 0, default: 0 },
        actual: { type: Number, min: 0, default: 0 },
      },
    ],
    openItems: {
      ncrs: { type: Number, default: 0 },
      tasks: { type: Number, default: 0 },
      expenses: { type: Number, default: 0 },
    },
    // Related sales-pipeline deals (quotations) from the portal.
    quotations: [
      {
        externalId: { type: String, default: '' }, // e.g. OPP-3006
        title: { type: String, required: true },
        stage: { type: String, default: '' }, // Lead/Qualified/Proposal/Negotiation/Won/Lost
        estValue: { type: Number, min: 0 },
        probability: { type: Number, min: 0, max: 100 },
        closeDate: { type: Date },
        owner: { type: String, default: '' },
      },
    ],
    risksExternal: [
      {
        probability: { type: String, default: '' }, // High/Med/Low
        impact: { type: String, default: '' },
        description: { type: String, required: true },
      },
    ],
    teamExternal: [
      {
        name: { type: String, required: true },
        role: { type: String, default: '' },
        utilization: { type: Number, min: 0, max: 100 },
      },
    ],
    lastSyncedAt: { type: Date },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

projectSchema.index({ name: 'text', description: 'text' });

export default mongoose.model('Project', projectSchema);
