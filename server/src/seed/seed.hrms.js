/**
 * Mock HRMS dataset — stands in for the real HRMS API until it ships. Populates
 * every HR model DDD consumes (employee master fields, attendance, leave,
 * recruitment, payroll, documents) so the owner dashboards + pages show data.
 * Everything is source='hrms' and idempotent (upsert on natural keys).
 *
 *   npm run seed:hrms      (run `npm run seed` first for roles + companies)
 */
import logger from '../config/logger.js';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import User from '../models/user.model.js';
import Role from '../models/role.model.js'; // registered so User.populate('roles') works
import Company from '../models/company.model.js';
import EmployeeRecord from '../models/employeeRecord.model.js';
import LeaveRequest from '../models/leaveRequest.model.js';
import LeaveBalance from '../models/leaveBalance.model.js';
import JobPosition from '../models/jobPosition.model.js';
import Candidate from '../models/candidate.model.js';
import PayrollPeriod from '../models/payrollPeriod.model.js';
import HrDocument from '../models/hrDocument.model.js';

const SEED_EMAIL = 'admin@itsybizzz.local';

const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const at = (day, h, m = 0) => { const x = new Date(day); x.setHours(h, m, 0, 0); return x; };
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rnd = (min, max) => Math.round(min + Math.random() * (max - min));

/** Map a user's DDD role → the HRMS access level it would have come from. */
function accessLevelFor(roleNames = []) {
  if (roleNames.some((r) => /admin/i.test(r))) return 'hr_admin';
  if (roleNames.some((r) => /manager/i.test(r))) return 'manager';
  return 'employee';
}

export async function seedHrms() {
  const admin = await User.findOne({ email: SEED_EMAIL });
  const adminId = admin?._id ?? null;
  const companies = await Company.find({ isActive: true });
  const primaryCompany = companies[0] || null;

  const users = await User.find({ isActive: true }).populate('roles', 'name slug');
  const employees = users.filter((u) => u.email !== SEED_EMAIL);

  const counts = { enriched: 0, attendance: 0, leave: 0, balances: 0, positions: 0, candidates: 0, payroll: 0, documents: 0 };

  // 1) Enrich the employee master with HR fields (don't clobber an existing hrmsId).
  let seq = 200;
  for (const u of employees) {
    seq += 1;
    const roleNames = (u.roles || []).map((r) => r.name || r.slug || '');
    u.source = 'hrms';
    if (!u.hrmsId) u.hrmsId = `EMP${String(seq).padStart(3, '0')}`;
    if (!u.employeeCode) u.employeeCode = u.hrmsId;
    u.accessLevel = accessLevelFor(roleNames);
    u.employmentType = u.employmentType || 'full_time';
    u.employmentStatus = 'active';
    u.workMode = u.workMode || pick(['office', 'remote', 'hybrid']);
    if (!u.dateOfJoining) u.dateOfJoining = addDays(startOfDay(new Date()), -rnd(120, 1400));
    await u.save();
    counts.enriched += 1;
  }

  // 2) Attendance — last 28 calendar days (weekends = week_off) per employee.
  const today = startOfDay(new Date());
  for (const u of employees) {
    for (let i = 27; i >= 0; i -= 1) {
      const date = addDays(today, -i);
      const dow = date.getDay(); // 0 Sun, 6 Sat
      let attendance = 'present';
      const detail = {};
      if (dow === 0 || dow === 6) {
        attendance = 'week_off';
      } else {
        const roll = Math.random();
        if (roll < 0.06) attendance = 'leave';
        else if (roll < 0.16) attendance = 'wfh';
        else attendance = 'present';
        if (attendance !== 'leave') {
          const late = Math.random() < 0.18;
          const inH = late ? 10 : 9;
          const inM = late ? rnd(15, 55) : rnd(0, 20);
          detail.checkIn = at(date, inH, inM);
          detail.checkOut = at(date, 18, rnd(0, 50));
          detail.hoursWorked = Math.max(0, Math.round(((detail.checkOut - detail.checkIn) / 3.6e6 - 1) * 10) / 10);
          detail.overtimeHours = Math.random() < 0.15 ? rnd(1, 3) : 0;
          detail.isLate = late;
          detail.lateByMinutes = late ? (inH - 9) * 60 + (inM - 15) : 0;
          detail.productivityScore = rnd(60, 98);
        } else {
          detail.leaveType = pick(['casual', 'sick', 'earned']);
        }
      }
      await EmployeeRecord.updateOne(
        { user: u._id, date },
        { $set: { attendance, source: 'hrms', ...detail }, $setOnInsert: { createdBy: adminId ?? u._id } },
        { upsert: true }
      );
      counts.attendance += 1;
    }
  }

  // 3) Leave balances + a few requests.
  const year = today.getFullYear();
  const balancePlan = { casual: 12, sick: 8, earned: 15 };
  for (const u of employees) {
    for (const [leaveType, entitled] of Object.entries(balancePlan)) {
      await LeaveBalance.updateOne(
        { user: u._id, year, leaveType },
        { $set: { hrmsId: u.hrmsId, entitled, taken: rnd(0, Math.floor(entitled / 2)), source: 'hrms' }, $setOnInsert: { createdBy: adminId ?? u._id } },
        { upsert: true }
      );
      counts.balances += 1;
    }
  }
  // Pending + approved leave requests spanning/around today.
  const leaveSample = employees.slice(0, Math.min(6, employees.length));
  for (let i = 0; i < leaveSample.length; i += 1) {
    const u = leaveSample[i];
    const from = addDays(today, i % 2 === 0 ? rnd(0, 5) : -rnd(1, 3));
    const days = rnd(1, 3);
    const ext = `HRLV-${u._id}-${i}`;
    await LeaveRequest.updateOne(
      { externalId: ext },
      {
        $set: {
          user: u._id, hrmsId: u.hrmsId, leaveType: pick(['casual', 'sick', 'earned']),
          fromDate: from, toDate: addDays(from, days - 1), days,
          status: i % 3 === 0 ? 'pending' : 'approved',
          approver: i % 3 === 0 ? null : adminId, reason: pick(['Personal', 'Medical', 'Family function', 'Travel']),
          source: 'hrms',
        },
        $setOnInsert: { createdBy: adminId ?? u._id, appliedAt: addDays(from, -3) },
      },
      { upsert: true }
    );
    counts.leave += 1;
  }

  // 4) Recruitment — positions + candidate pipeline.
  const positionsSpec = [
    { title: 'Senior MERN Developer', department: 'Engineering', openings: 2, priority: 'high' },
    { title: 'SAP ABAP Consultant', department: 'Engineering', openings: 1, priority: 'urgent' },
    { title: 'Business Development Executive', department: 'Sales', openings: 3, priority: 'medium' },
    { title: 'HR Executive', department: 'HR & Admin', openings: 1, priority: 'low' },
  ];
  const posDocs = [];
  for (let i = 0; i < positionsSpec.length; i += 1) {
    const p = positionsSpec[i];
    const ext = `HRJOB-${i + 1}`;
    const doc = await JobPosition.findOneAndUpdate(
      { externalId: ext },
      {
        $set: { ...p, company: primaryCompany?._id ?? null, status: 'open', source: 'hrms', targetHireDate: addDays(today, rnd(20, 60)) },
        $setOnInsert: { createdBy: adminId, openSince: addDays(today, -rnd(10, 45)) },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    posDocs.push(doc);
    counts.positions += 1;
  }
  const stages = ['applied', 'applied', 'screening', 'screening', 'interview', 'interview', 'offer', 'hired', 'rejected'];
  const firstNames = ['Aarav', 'Isha', 'Rohan', 'Sneha', 'Karan', 'Neha', 'Amit', 'Pooja', 'Vikram', 'Ritu', 'Sahil', 'Divya'];
  for (let i = 0; i < 14; i += 1) {
    const ext = `HRCAND-${i + 1}`;
    const stage = stages[i % stages.length];
    const applied = addDays(today, -rnd(3, 40));
    await Candidate.updateOne(
      { externalId: ext },
      {
        $set: {
          name: `${pick(firstNames)} ${pick(['Sharma', 'Verma', 'Patel', 'Nair', 'Gupta', 'Singh'])}`,
          email: `candidate${i + 1}@example.com`, phone: `98${rnd(10000000, 99999999)}`,
          position: pick(posDocs)._id, stage, source: pick(['LinkedIn', 'Naukri', 'Referral', 'Website']),
          appliedAt: applied, stageUpdatedAt: addDays(applied, rnd(1, 20)),
          rating: rnd(2, 5), sourceSystem: 'hrms',
        },
        $setOnInsert: { createdBy: adminId },
      },
      { upsert: true }
    );
    counts.candidates += 1;
  }

  // 5) Payroll — last 6 months per company.
  const depts = ['Engineering', 'Sales', 'HR & Admin', 'Operations'];
  for (const company of companies) {
    for (let m = 5; m >= 0; m -= 1) {
      const d = new Date(today.getFullYear(), today.getMonth() - m, 1);
      const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const byDepartment = depts.map((department) => {
        const headcount = rnd(2, 10);
        return { department, headcount, cost: headcount * rnd(35000, 90000) };
      });
      const totalCost = byDepartment.reduce((s, x) => s + x.cost, 0);
      const headcount = byDepartment.reduce((s, x) => s + x.headcount, 0);
      await PayrollPeriod.updateOne(
        { month, company: company._id },
        {
          $set: {
            status: m === 0 ? 'processing' : 'paid', currency: 'INR', totalCost, headcount, byDepartment,
            reimbursementsPending: rnd(0, 6), reimbursementsAmount: rnd(0, 40000), source: 'hrms',
            externalId: `HRPAY-${company.code}-${month}`,
          },
          $setOnInsert: { createdBy: adminId },
        },
        { upsert: true }
      );
      counts.payroll += 1;
    }
  }

  // 6) HR documents — a mix, some expiring soon.
  const docTypes = ['contract', 'pan', 'aadhaar', 'certification', 'passport'];
  for (let i = 0; i < employees.length; i += 1) {
    const u = employees[i];
    const docType = docTypes[i % docTypes.length];
    const soon = i % 4 === 0; // some expiring within ~20 days
    const ext = `HRDOC-${u._id}-${docType}`;
    await HrDocument.updateOne(
      { externalId: ext },
      {
        $set: {
          user: u._id, hrmsId: u.hrmsId, docType,
          issuedOn: addDays(today, -rnd(200, 1200)),
          expiresOn: soon ? addDays(today, rnd(3, 20)) : addDays(today, rnd(120, 900)),
          source: 'hrms',
        },
        $setOnInsert: { createdBy: adminId ?? u._id },
      },
      { upsert: true }
    );
    counts.documents += 1;
  }

  return counts;
}

// CLI runner.
const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('seed.hrms.js');
if (isMain) {
  (async () => {
    try {
      await connectDatabase();
      const c = await seedHrms();
      logger.info(`HRMS mock seed complete: ${JSON.stringify(c)}`);
    } catch (err) {
      logger.error(`HRMS seed failed: ${err.message}`);
      process.exitCode = 1;
    } finally {
      await disconnectDatabase();
    }
  })();
}
