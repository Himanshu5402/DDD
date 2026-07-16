import mongoose from 'mongoose';

const { Schema } = mongoose;

export const ATTENDANCE_STATUSES = Object.freeze([
  'present',
  'absent',
  'half_day',
  'leave',
  'wfh',
  'holiday',
]);
export const RECORD_SOURCES = Object.freeze(['manual', 'hrms']);

const kpiSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    score: { type: Number, min: 0, max: 100, default: 0 },
  },
  { _id: true }
);

const employeeRecordSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // Normalized to start of day in the service so {user, date} is unique per day.
    date: { type: Date, required: true, index: true },

    attendance: { type: String, enum: ATTENDANCE_STATUSES, default: 'present' },
    hoursWorked: { type: Number, min: 0, max: 24, default: 0 },

    kpis: [kpiSchema],
    productivityScore: { type: Number, min: 0, max: 100, default: 0 },

    // Skills demonstrated/trained that day (optional).
    skills: [{ type: String, trim: true }],

    notes: { type: String, default: '' },
    source: { type: String, enum: RECORD_SOURCES, default: 'manual' },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true }
);

// One record per employee per day.
employeeRecordSchema.index({ user: 1, date: 1 }, { unique: true });

export default mongoose.model('EmployeeRecord', employeeRecordSchema);
