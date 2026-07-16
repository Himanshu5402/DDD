import mongoose from 'mongoose';

/**
 * A company/legal entity the owner operates. Work items (tasks, and later
 * other modules) are tagged with the company they belong to, so the owner
 * can slice everything per business.
 */
const companySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true }, // short tag, e.g. DNS
    color: { type: String, default: '#4f46e5' }, // brand accent used across the UI
    description: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // null = system seed
  },
  { timestamps: true }
);

export default mongoose.model('Company', companySchema);
