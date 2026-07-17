/**
 * Demo org chart for the delegation workflow.
 *   npm run seed:org   (run `npm run seed` + `npm run seed:demo` first)
 *
 * Structure seeded:
 *   Pankaj Shukla (CTO, Engineering manager)
 *     ├─ Rohit Verma   — Sr. MERN Developer
 *     ├─ Neha Gupta    — Frontend Developer   (created if missing)
 *     ├─ Deepak Joshi  — Backend Developer    (created if missing)
 *     └─ Harsh Vardhan — DevOps Engineer      (created if missing)
 *   Vikas Malik (Operations manager)
 *     └─ Priya Singh   — Accounts Executive
 *
 * Idempotent: existing users are kept; reportsTo is (re)applied every run.
 * New developer accounts use the shared demo password.
 */
import logger from '../config/logger.js';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import User from '../models/user.model.js';
import Role from '../models/role.model.js';
import Company from '../models/company.model.js';
import { SYSTEM_ROLES } from '../config/constants.js';

const DEMO_PASSWORD = 'Demo@12345';

// Developers on Pankaj's team (created at IBZ if they don't exist yet).
const DEVELOPERS = [
  { hrmsId: 'EMP004', name: 'Neha Gupta', email: 'neha.gupta@itsybizz.ai', designation: 'Frontend Developer' },
  { hrmsId: 'EMP010', name: 'Deepak Joshi', email: 'deepak.joshi@itsybizz.ai', designation: 'Backend Developer' },
  { hrmsId: 'EMP018', name: 'Harsh Vardhan', email: 'harsh.vardhan@itsybizz.ai', designation: 'DevOps Engineer' },
];

// manager email -> report emails
const ORG = {
  'pankaj.shukla@deepnapsoftech.com': [
    'rohit.verma@itsybizz.ai',
    'neha.gupta@itsybizz.ai',
    'deepak.joshi@itsybizz.ai',
    'harsh.vardhan@itsybizz.ai',
  ],
  'vikas.malik@dryish.com': ['priya.singh@deepnapsoftech.com'],
};

(async () => {
  try {
    await connectDatabase();

    const employeeRole = await Role.findOne({ slug: SYSTEM_ROLES.EMPLOYEE });
    const ibz = await Company.findOne({ code: 'IBZ' });
    if (!employeeRole || !ibz) throw new Error('Run `npm run seed` first (roles/companies missing).');

    let created = 0;
    for (const dev of DEVELOPERS) {
      const exists = await User.findOne({ email: dev.email });
      if (exists) continue;
      await new User({
        name: dev.name,
        email: dev.email,
        password: DEMO_PASSWORD, // hashed by the model pre-save hook
        roles: [employeeRole._id],
        designation: dev.designation,
        department: 'Engineering',
        company: ibz._id,
        source: 'hrms',
        hrmsId: dev.hrmsId,
        mustChangePassword: false,
        isActive: true,
      }).save();
      created += 1;
      logger.info(`  + ${dev.name} — ${dev.designation} @ Itsybizz AI`);
    }

    let linked = 0;
    for (const [managerEmail, reportEmails] of Object.entries(ORG)) {
      const manager = await User.findOne({ email: managerEmail });
      if (!manager) {
        logger.warn(`  ! Manager ${managerEmail} not found — run \`npm run seed:demo\` first.`);
        continue;
      }
      const result = await User.updateMany(
        { email: { $in: reportEmails } },
        { reportsTo: manager._id }
      );
      linked += result.modifiedCount;
      logger.info(`  ⤷ ${reportEmails.length} report(s) → ${manager.name}`);
    }

    logger.info(`Org chart seeded → ${created} developer(s) created, ${linked} reporting link(s) applied`);
    logger.info(`New developer accounts log in with password: ${DEMO_PASSWORD}`);
    await disconnectDatabase();
    process.exit(0);
  } catch (err) {
    logger.error(`Org seed failed: ${err.stack || err.message}`);
    process.exit(1);
  }
})();
