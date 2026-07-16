import mongoose from 'mongoose';

/**
 * Immutable audit trail. Every meaningful action (auth events, create/update/
 * delete on domain entities) writes one entry here for compliance & forensics.
 */
const auditLogSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // null = system
    actorEmail: { type: String, default: '' },
    action: { type: String, required: true, index: true }, // e.g. 'auth.login', 'update'
    module: { type: String, default: '', index: true },
    entityType: { type: String, default: '' },
    entityId: { type: String, default: '' },
    description: { type: String, default: '' },
    status: { type: String, enum: ['success', 'failure'], default: 'success' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    requestId: { type: String, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ actor: 1, createdAt: -1 });
auditLogSchema.index({ module: 1, action: 1, createdAt: -1 });

export default mongoose.model('AuditLog', auditLogSchema);
