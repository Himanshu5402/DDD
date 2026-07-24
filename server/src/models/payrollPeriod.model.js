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

/** One employee's salary breakup for the month — mirrored from HRMS payroll. */
const payrollEntrySchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    empId: { type: String, trim: true, default: '' },
    name: { type: String, trim: true, default: '' },
    department: { type: String, trim: true, default: '' },
    designation: { type: String, trim: true, default: '' },
    joinDate: { type: String, default: '' }, // 'YYYY-MM-DD'
    gross: { type: Number, min: 0, default: 0 },
    basic: { type: Number, min: 0, default: 0 },
    hra: { type: Number, min: 0, default: 0 },
    special: { type: Number, min: 0, default: 0 },
    pf: { type: Number, min: 0, default: 0 },
    pt: { type: Number, min: 0, default: 0 },
    tds: { type: Number, min: 0, default: 0 },
    deductions: { type: Number, min: 0, default: 0 },
    net: { type: Number, min: 0, default: 0 },
    paid: { type: Boolean, default: false },
  },
  { _id: false }
);

/** One reimbursement claim (HRMS expense module) dated in this month. */
const reimbursementSchema = new Schema(
  {
    code: { type: String, trim: true, default: '' }, // EXP-118
    empId: { type: String, trim: true, default: '' },
    title: { type: String, trim: true, default: '' },
    category: { type: String, trim: true, default: '' },
    amount: { type: Number, min: 0, default: 0 },
    date: { type: String, default: '' }, // 'YYYY-MM-DD'
    status: { type: String, trim: true, default: '' }, // Pending/Approved/Rejected/Paid
    decidedBy: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

/**
 * A monthly payroll period per company, mirrored from HRMS/payroll: aggregate
 * roll-ups PLUS the full per-employee salary breakup (`entries`) and the
 * month's reimbursement claims — everything payment-related the HRMS holds.
 * One per {month, company}. Ties into the Finance people-cost picture.
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

    // Full payment detail mirrored from HRMS (empty for manual periods).
    paidOn: { type: String, default: '' }, // 'YYYY-MM-DD'
    entries: { type: [payrollEntrySchema], default: [] },
    reimbursements: { type: [reimbursementSchema], default: [] },

    source: { type: String, enum: ['manual', 'hrms'], default: 'manual', index: true },
    externalId: { type: String, trim: true, unique: true, sparse: true },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true }
);

payrollPeriodSchema.index({ month: 1, company: 1 }, { unique: true });

export default mongoose.model('PayrollPeriod', payrollPeriodSchema);
