import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expandTemplates } from '../expandTemplates.js';

// --- Fixtures -------------------------------------------------------------
// Start date Mon 2026-01-05 (see dates.test.js for the reference week).

const employee = {
  id: 'recEMP001',
  full_name: 'Jane Doe',
  work_email: 'jane@corp.com',
  role: 'Backend Engineer',
  start_date: '2026-01-05',
  manager_telegram_id: '555001',
};

const templates = [
  { id: 'recT1', title: 'Sign contract', description: 'Signed employment contract on file', role: null, applies_to_all: true, assignee_role: 'HR', day_offset: -3, active: true },
  { id: 'recT2', title: 'Issue laptop', description: 'Laptop imaged and handed over', role: 'Backend Engineer', applies_to_all: false, assignee_role: 'IT', day_offset: -1, active: true },
  { id: 'recT3', title: 'Team intro', description: 'Introduce to the team', role: 'Backend Engineer', applies_to_all: false, assignee_role: 'Manager', day_offset: 1, active: true },
  { id: 'recT4', title: 'Payroll setup', description: 'Add to payroll', role: 'Backend Engineer', applies_to_all: false, assignee_role: 'Finance', day_offset: 2, active: true },
  { id: 'recT5', title: 'Truck check', description: 'Assign service truck', role: 'Service Technician', applies_to_all: false, assignee_role: 'IT', day_offset: 0, active: true },
  { id: 'recT6', title: 'Old universal task', description: 'Retired', role: null, applies_to_all: true, assignee_role: 'HR', day_offset: 0, active: false },
];

const assignees = [
  { name: 'Alice HR', assignee_role: 'HR', telegram_id: '111', active: true },
  { name: 'Bob IT', assignee_role: 'IT', telegram_id: '222', active: true },
  { name: 'Old Finance', assignee_role: 'Finance', telegram_id: '999', active: false }, // inactive
];

const byKey = (tasks) => Object.fromEntries(tasks.map((t) => [t.Task_Key, t]));

// --- Tests ----------------------------------------------------------------

test('selects universal + role-matched active templates, excludes others', () => {
  const { tasks } = expandTemplates(employee, templates, assignees);
  const keys = tasks.map((t) => t.Task_Key).sort();
  assert.deepEqual(keys, [
    'recEMP001::recT1', // universal
    'recEMP001::recT2', // role match
    'recEMP001::recT3', // role match
    'recEMP001::recT4', // role match
  ]);
  // recT5 (other role) and recT6 (inactive universal) are excluded.
});

test('builds Task_Key from the employee record id, snapshots fields, sets Pending', () => {
  const { tasks } = expandTemplates(employee, templates, assignees);
  const t = byKey(tasks)['recEMP001::recT2'];
  assert.equal(t.Task_Key, 'recEMP001::recT2');
  assert.equal(t.Employee, 'recEMP001');
  assert.equal(t.Template, 'recT2');
  assert.equal(t.Title, 'Issue laptop');
  assert.equal(t.Description, 'Laptop imaged and handed over');
  assert.equal(t.Assignee_Role, 'IT');
  assert.equal(t.Status, 'Pending');
});

test('computes Due_Date via the calendar-offset + weekend rule', () => {
  const { tasks } = expandTemplates(employee, templates, assignees);
  const t = byKey(tasks);
  assert.equal(t['recEMP001::recT1'].Due_Date, '2026-01-02'); // -3 -> Fri (weekday)
  assert.equal(t['recEMP001::recT2'].Due_Date, '2026-01-02'); // -1 -> Sun -> back to Fri
  assert.equal(t['recEMP001::recT3'].Due_Date, '2026-01-06'); // +1 -> Tue
  assert.equal(t['recEMP001::recT4'].Due_Date, '2026-01-07'); // +2 -> Wed
});

test('resolves a normal role and the Manager role', () => {
  const { tasks } = expandTemplates(employee, templates, assignees);
  const t = byKey(tasks);
  assert.equal(t['recEMP001::recT1'].Assignee_Telegram_ID, '111'); // HR
  assert.equal(t['recEMP001::recT2'].Assignee_Telegram_ID, '222'); // IT
  assert.equal(t['recEMP001::recT3'].Assignee_Telegram_ID, '555001'); // Manager -> employee's manager
  for (const key of ['recEMP001::recT1', 'recEMP001::recT2', 'recEMP001::recT3']) {
    assert.equal(t[key].Unresolved_Assignee, false);
  }
});

test('role with no active assignee: task created, flagged, and warned', () => {
  const { tasks, warnings } = expandTemplates(employee, templates, assignees);
  const finance = byKey(tasks)['recEMP001::recT4'];
  assert.equal(finance.Assignee_Telegram_ID, '');
  assert.equal(finance.Unresolved_Assignee, true);
  assert.deepEqual(warnings, [
    { task_key: 'recEMP001::recT4', assignee_role: 'Finance', reason: 'No active assignee configured for role "Finance"' },
  ]);
});

test('empty manager id: manager task is unresolved and warned (F2 fallback)', () => {
  const noManager = { ...employee, manager_telegram_id: '' };
  const onlyManagerTemplate = [templates[2]]; // recT3, Assignee_Role = Manager
  const { tasks, warnings } = expandTemplates(noManager, onlyManagerTemplate, assignees);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].Assignee_Telegram_ID, '');
  assert.equal(tasks[0].Unresolved_Assignee, true);
  assert.deepEqual(warnings, [
    { task_key: 'recEMP001::recT3', assignee_role: 'Manager', reason: 'Employee has no Manager_Telegram_ID' },
  ]);
});

test('role with no role-specific templates gets only the universal ones', () => {
  const salesperson = { ...employee, id: 'recEMP002', role: 'Sales' };
  const { tasks, warnings } = expandTemplates(salesperson, templates, assignees);
  assert.deepEqual(tasks.map((t) => t.Task_Key), ['recEMP002::recT1']); // only universal, active one
  assert.equal(warnings.length, 0);
});

test('fully resolvable expansion produces no warnings', () => {
  const withFinance = [
    ...assignees,
    { name: 'Fay Finance', assignee_role: 'Finance', telegram_id: '333', active: true },
  ];
  const { warnings } = expandTemplates(employee, templates, withFinance);
  assert.deepEqual(warnings, []);
});
