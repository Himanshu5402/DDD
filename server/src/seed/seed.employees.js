/**
 * Demo employees across the owner's three companies.
 *   npm run seed:employees -w server
 *
 * Placeholder data until the company HRMS API is integrated — real employees
 * will then sync via hrmsId upserts (same pattern as the PEPSI project sync).
 * Idempotent: skips anyone whose email already exists.
 *
 * All demo accounts: password Employee@123 (mustChangePassword=true), role: employee.
 */
import env from '../config/env.js';
import logger from '../config/logger.js';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import User from '../models/user.model.js';
import Role from '../models/role.model.js';
import Company from '../models/company.model.js';
import { SYSTEM_ROLES } from '../config/constants.js';

const EMPLOYEES = {
  // Deepnapsoftech — 2 IoT, 2 Embedded, 3 PLC
  DNS: [
    { name: 'Arjun Mehta', designation: 'IoT Engineer', department: 'Engineering' },
    { name: 'Sneha Kulkarni', designation: 'IoT Engineer', department: 'Engineering' },
    { name: 'Rohan Gupta', designation: 'Embedded Engineer', department: 'Engineering' },
    { name: 'Priya Nair', designation: 'Embedded Engineer', department: 'Engineering' },
    { name: 'Vikram Singh', designation: 'PLC Engineer', department: 'Engineering' },
    { name: 'Anil Kumar', designation: 'PLC Engineer', department: 'Engineering' },
    { name: 'Kavita Joshi', designation: 'PLC Engineer', department: 'Engineering' },
  ],
  // Itsybizz AI — 2 MERN, 4 Python, 2 Graphic Design, 1 Social Media
  IBZ: [
    { name: 'Aman Verma', designation: 'MERN Stack Developer', department: 'Engineering' },
    { name: 'Nikita Rao', designation: 'MERN Stack Developer', department: 'Engineering' },
    { name: 'Sahil Khan', designation: 'Python Developer', department: 'Engineering' },
    { name: 'Pooja Iyer', designation: 'Python Developer', department: 'Engineering' },
    { name: 'Manish Tiwari', designation: 'Python Developer', department: 'Engineering' },
    { name: 'Ritu Agarwal', designation: 'Python Developer', department: 'Engineering' },
    { name: 'Karan Malhotra', designation: 'Graphic Designer', department: 'Design' },
    { name: 'Simran Kaur', designation: 'Graphic Designer', department: 'Design' },
    { name: 'Tanvi Desai', designation: 'Social Media Marketing', department: 'Marketing' },
  ],
  // Dryish ERCS — 2 Accountants, 1 HR, 1 Driver, 2 Office Assistants
  DRY: [
    { name: 'Suresh Patel', designation: 'Accountant', department: 'Accounts' },
    { name: 'Meena Gupta', designation: 'Accountant', department: 'Accounts' },
    { name: 'Anjali Saxena', designation: 'HR Executive', department: 'Human Resources' },
    { name: 'Ramesh Yadav', designation: 'Driver', department: 'Operations' },
    { name: 'Sonu Kumar', designation: 'Office Assistant', department: 'Operations' },
    { name: 'Mohan Lal', designation: 'Office Assistant', department: 'Operations' },
  ],
};

const EMAIL_DOMAINS = {
  DNS: 'deepnapsoftech.local',
  IBZ: 'itsybizz.local',
  DRY: 'dryish.local',
};

const DEMO_PASSWORD = 'Employee@123';

const emailFor = (name, domain) =>
  `${name.toLowerCase().replace(/[^a-z ]/g, '').trim().replace(/\s+/g, '.')}@${domain}`;

(async () => {
  try {
    await connectDatabase();

    const employeeRole = await Role.findOne({ slug: SYSTEM_ROLES.EMPLOYEE });
    if (!employeeRole) throw new Error('Employee role not found — run `npm run seed` first.');

    const companies = await Company.find({ code: { $in: Object.keys(EMPLOYEES) } });
    const byCode = Object.fromEntries(companies.map((c) => [c.code, c]));
    for (const code of Object.keys(EMPLOYEES)) {
      if (!byCode[code]) throw new Error(`Company ${code} not found — run \`npm run seed\` first.`);
    }

    let created = 0;
    let skipped = 0;

    for (const [code, people] of Object.entries(EMPLOYEES)) {
      for (const person of people) {
        const email = emailFor(person.name, EMAIL_DOMAINS[code]);
        const exists = await User.findOne({ email });
        if (exists) {
          skipped += 1;
          continue;
        }
        await new User({
          name: person.name,
          email,
          password: DEMO_PASSWORD, // hashed by pre-save hook
          roles: [employeeRole._id],
          designation: person.designation,
          department: person.department,
          company: byCode[code]._id,
          source: 'manual',
          mustChangePassword: true,
          isActive: true,
        }).save();
        created += 1;
        logger.info(`  + ${person.name} — ${person.designation} @ ${byCode[code].name}`);
      }
    }

    logger.info(`Demo employees → created ${created}, skipped ${skipped} (already existed)`);
    await disconnectDatabase();
    process.exit(0);
  } catch (err) {
    logger.error(`Employee seed failed: ${err.stack || err.message}`);
    process.exit(1);
  }
})();
