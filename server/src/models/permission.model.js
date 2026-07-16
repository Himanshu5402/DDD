import mongoose from 'mongoose';
import { MODULE_LIST, ACTION_LIST } from '../config/constants.js';

/**
 * A single granular capability = (module, action).
 * e.g. { module: 'users', action: 'read' } → key "users:read".
 * The seeder generates the full matrix of module × action permissions.
 */
const permissionSchema = new mongoose.Schema(
  {
    module: { type: String, required: true, enum: MODULE_LIST, index: true },
    action: { type: String, required: true, enum: ACTION_LIST },
    key: { type: String, required: true, unique: true }, // `${module}:${action}`
    description: { type: String, default: '' },
    isSystem: { type: Boolean, default: true },
  },
  { timestamps: true }
);

permissionSchema.index({ module: 1, action: 1 }, { unique: true });

permissionSchema.pre('validate', function setKey(next) {
  if (this.module && this.action) this.key = `${this.module}:${this.action}`;
  next();
});

export default mongoose.model('Permission', permissionSchema);
