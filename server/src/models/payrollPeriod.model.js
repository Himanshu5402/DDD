import mongoose from 'mongoose';

const { Schema } = mongoose;

export const PAYROLL_STATUSES = Object.freeze(['draft', 'processing', 'processed', 'paid']);

const deptCostSchema = new Schema(
  {
    department: { type: String, trim: true, default: '' },
    headcount: { type: Number, min: 0, default: 0 },
    cost: { type: Number, min: 0, default: 0 },
  },
  { _id: false }
);

/**
 * A monthly payroll roll-up per company, mirrored from HRMS/payroll. DDD stores
 * only aggregates (owner cost view) — never individual salaries. One per
 * {month, company}. Ties into the Finance people-cost picture.
 */
const payrollPeriodSchema = new Schema(
  {
    month: { type: String, required: true, index: true }, // 'YYYY-MM'
    company: { type: Schema.Types.ObjectId, ref: 'Company', default: null, index: true },

    status: { type: String, enum: PAYROLL_STATUSES, default: 'processed', index: true },
    currency: { type: String, default: 'INR' },
    totalCost: { type: Number, min: 0, default: 0 },
    headcount: { type: Number, min: 0, default: 0 },
    byDepartment: { type: [deptCostSchema], default: [] },

    reimbursementsPending: { type: Number, min: 0, default: 0 },
    reimbursementsAmount: { type: Number, min: 0, default: 0 },

    source: { type: String, enum: ['manual', 'hrms'], default: 'manual', index: true },
    externalId: { type: String, trim: true, unique: true, sparse: true },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true }
);

payrollPeriodSchema.index({ month: 1, company: 1 }, { unique: true });

export default mongoose.model('PayrollPeriod', payrollPeriodSchema);
