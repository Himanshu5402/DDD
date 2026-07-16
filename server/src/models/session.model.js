import mongoose from 'mongoose';

/**
 * Represents an issued refresh token (a login session). We store only a
 * SHA-256 hash of the refresh token, never the raw value. Supports refresh
 * token rotation (replacedBy) and revocation (logout / "log out everywhere").
 * Expired sessions are auto-removed via a TTL index.
 */
const sessionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, index: true },
    userAgent: { type: String, default: '' },
    ip: { type: String, default: '' },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    replacedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', default: null },
  },
  { timestamps: true }
);

// TTL index: MongoDB removes the doc once expiresAt passes.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

sessionSchema.methods.isActive = function isActive() {
  return !this.revokedAt && this.expiresAt.getTime() > Date.now();
};

export default mongoose.model('Session', sessionSchema);
