/**
 * Five demo employees spanning different RBAC roles and companies, so you can
 * test login + RBAC end-to-end.
 *   npm run seed:demo   (run `npm run seed` first for roles + companies)
 *
 * These stand in for records that will later sync from the company HRMS. Each
 * carries source='hrms' + hrmsId (the HRMS EMP id) and shows the intended
 * HRMS-access → DDD-role mapping:
 *
 *   HRMS "access"            → DDD role
 *   ----------------------------------------
 *   HR Admin / Owner         → admin
 *   Manager (any dept)       → manager
 *   Employee / Representative→ employee
 *
 * Idempotent: skips anyone whose email already exists. All demo accounts share
 * the password below and can log in immediately (mustChangePassword=false).
 */
import logger from '../config/logger.js';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import User from '../models/user.model.js';
import Role from '../models/role.model.js';
import Company from '../models/company.model.js';
import { SYSTEM_ROLES } from '../config/constants.js';

export const DEMO_PASSWORD = 'Demo@12345';

// companyCode → the seeded Company.code from seed.core
const DEMO_EMPLOYEES = [
  {
    hrmsId: 'EMP002',
    name: 'Aarti Sharma',
    email: 'aarti.sharma@itsybizz.ai',
    company: 'IBZ',
    designation: 'HR Manager',
    department: 'HR & Admin',
    hrmsAccess: 'HR Admin',
    role: SYSTEM_ROLES.ADMIN,
    phone: '98110 11002',
  },
  {
    hrmsId: 'EMP001',
    name: 'Pankaj Shukla',
    email: 'pankaj.shukla@deepnapsoftech.com',
    company: 'DNS',
    designation: 'Co-founder & CTO',
    department: 'Engineering',
    hrmsAccess: 'Manager',
    role: SYSTEM_ROLES.MANAGER,
    phone: '98110 11001',
  },
  {
    hrmsId: 'EMP008',
    name: 'Vikas Malik',
    email: 'vikas.malik@dryish.com',
    company: 'DRY',
    designation: 'Operations Manager',
    department: 'Operations',
    hrmsAccess: 'Manager',
    role: SYSTEM_ROLES.MANAGER,
    phone: '98110 11008',
  },
  {
    hrmsId: 'EMP003',
    name: 'Rohit Verma',
    email: 'rohit.verma@itsybizz.ai',
    company: 'IBZ',
    designation: 'Sr. MERN Developer',
    department: 'Engineering',
    hrmsAccess: 'Employee',
    role: SYSTEM_ROLES.EMPLOYEE,
    phone: '98110 11003',
  },
  {
    hrmsId: 'EMP007',
    name: 'Priya Singh',
    email: 'priya.singh@deepnapsoftech.com',
    company: 'DNS',
    designation: 'Accounts Executive',
    department: 'Accounts',
    hrmsAccess: 'Finance Representative',
    role: SYSTEM_ROLES.EMPLOYEE,
    phone: '98110 11007',
  },
];

(async () => {
  try {
    await connectDatabase();

    const roles = await Role.find({
      slug: { $in: [SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.MANAGER, SYSTEM_ROLES.EMPLOYEE] },
    });
    const roleBySlug = Object.fromEntries(roles.map((r) => [r.slug, r]));

    const companies = await Company.find({ code: { $in: ['IBZ', 'DNS', 'DRY'] } });
    const companyByCode = Object.fromEntries(companies.map((c) => [c.code, c]));

    let created = 0;
    let skipped = 0;

    for (const person of DEMO_EMPLOYEES) {
      const role = roleBySlug[person.role];
      const company = companyByCode[person.company];
      if (!role) throw new Error(`Role ${person.role} not found — run \`npm run seed\` first.`);
      if (!company) throw new Error(`Company ${person.company} not found — run \`npm run seed\` first.`);

      const exists = await User.findOne({ email: person.email });
      if (exists) {
        skipped += 1;
        continue;
      }

      await new User({
        name: person.name,
        email: person.email,
        password: DEMO_PASSWORD, // hashed by the model pre-save hook
        roles: [role._id],
        designation: person.designation,
        department: person.department,
        phone: person.phone,
        company: company._id,
        source: 'hrms',
        hrmsId: person.hrmsId,
        mustChangePassword: false,
        isActive: true,
      }).save();

      created += 1;
      logger.info(
        `  + ${person.name} — ${person.role.toUpperCase()} @ ${company.name} ` +
          `(HRMS ${person.hrmsId} / "${person.hrmsAccess}")`
      );
    }

    logger.info(`Demo employees → created ${created}, skipped ${skipped} (already existed)`);
    logger.info(`All demo accounts log in with password: ${DEMO_PASSWORD}`);
    await disconnectDatabase();
    process.exit(0);
  } catch (err) {
    logger.error(`Demo seed failed: ${err.stack || err.message}`);
    process.exit(1);
  }
})();
