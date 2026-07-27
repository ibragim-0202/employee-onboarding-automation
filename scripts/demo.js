// demo.js — runs the Block 2 logic end to end on sample data, no Airtable needed.
//   npm run demo
// Mirrors what the F1/F2 n8n workflows do in JS: validate the intake, then expand
// the role's templates into dated, assigned tasks. Useful for the README and demo video.

import { validate } from './validate.js';
import { expandTemplates } from './expandTemplates.js';

// Fixed reference date so the output is identical on every run.
const TODAY = '2026-07-27';

const employee = {
  id: 'recEMP001',
  full_name: 'Jane Doe',
  work_email: 'jane.doe@corp.com',
  role: 'Backend Engineer',
  department: 'Engineering',
  start_date: '2026-08-03', // Monday
  manager_telegram_id: '555001',
};

const roles = [
  { role_name: 'Backend Engineer', active: true },
  { role_name: 'Service Technician', active: true },
];

const templates = [
  { id: 'recT1', title: 'Sign employment contract', description: 'Signed contract on file', role: null, applies_to_all: true, assignee_role: 'HR', day_offset: -3, active: true },
  { id: 'recT2', title: 'Issue laptop', description: 'Laptop imaged and handed over', role: 'Backend Engineer', applies_to_all: false, assignee_role: 'IT', day_offset: -1, active: true },
  { id: 'recT3', title: 'Team introduction', description: 'Introduce the new hire to the team', role: 'Backend Engineer', applies_to_all: false, assignee_role: 'Manager', day_offset: 1, active: true },
  { id: 'recT4', title: 'Add to payroll', description: 'Register in the payroll system', role: 'Backend Engineer', applies_to_all: false, assignee_role: 'Finance', day_offset: 2, active: true },
];

const assignees = [
  { name: 'Alice HR', assignee_role: 'HR', telegram_id: '111', active: true },
  { name: 'Bob IT', assignee_role: 'IT', telegram_id: '222', active: true },
  // No active Finance assignee on purpose -> demonstrates the unresolved-assignee warning.
];

console.log(`\n=== Onboarding demo — reference date ${TODAY} ===\n`);
console.log(`Employee: ${employee.full_name} · ${employee.role} · starts ${employee.start_date}\n`);

const { valid, errors } = validate(employee, roles, templates, TODAY);
console.log(`Validation: ${valid ? 'PASS' : 'FAIL'}`);
if (!valid) {
  for (const e of errors) console.log(`  - [${e.field}] ${e.message}`);
  console.log('\nIntake would be marked Error and HR notified. Stopping.\n');
  process.exit(0);
}

const { tasks, warnings } = expandTemplates(employee, templates, assignees);

console.log(`\nExpanded ${tasks.length} task(s):\n`);
for (const t of tasks) {
  const who = t.Assignee_Telegram_ID || '(unresolved)';
  console.log(`  ${t.Due_Date}  ${t.Title.padEnd(26)} ${t.Assignee_Role.padEnd(8)} -> ${who}`);
}

console.log(`\nWarnings: ${warnings.length}`);
for (const w of warnings) {
  console.log(`  - ${w.reason} (task ${w.task_key})`);
}
if (warnings.length > 0) {
  console.log('\nF2 would send HR one summary message about the unresolved assignee(s).');
}
console.log('');
