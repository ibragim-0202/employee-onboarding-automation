import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate } from '../validate.js';

const TODAY = '2026-01-05'; // injected reference for "future"

const roles = [
  { role_name: 'Backend Engineer', active: true },
  { role_name: 'Service Technician', active: true },
  { role_name: 'Retired Role', active: false },
];

const templates = [
  { role: null, applies_to_all: true, assignee_role: 'HR', active: true },
  { role: 'Backend Engineer', applies_to_all: false, assignee_role: 'Manager', active: true },
  { role: 'Service Technician', applies_to_all: false, assignee_role: 'IT', active: true },
  // Service Technician has NO active manager template:
  { role: 'Service Technician', applies_to_all: false, assignee_role: 'Manager', active: false },
];

const validEmployee = {
  full_name: 'Jane Doe',
  work_email: 'jane@corp.com',
  role: 'Backend Engineer',
  department: 'Engineering',
  start_date: '2026-02-01',
  manager_telegram_id: '555001',
};

const fieldsOf = (res) => res.errors.map((e) => e.field);

test('a fully valid record passes with no errors', () => {
  assert.deepEqual(validate(validEmployee, roles, templates, TODAY), { valid: true, errors: [] });
});

test('collects every error at once, not just the first', () => {
  const broken = { start_date: '2026-13-01' }; // missing everything + bad date
  const res = validate(broken, roles, templates, TODAY);
  assert.equal(res.valid, false);
  // required: full_name, work_email, role, department (start_date is present but invalid)
  assert.ok(res.errors.length >= 5);
  assert.ok(fieldsOf(res).includes('full_name'));
  assert.ok(fieldsOf(res).includes('work_email'));
  assert.ok(fieldsOf(res).includes('department'));
  assert.ok(fieldsOf(res).includes('start_date'));
});

test('start date today is NOT in the future (strict boundary)', () => {
  const res = validate({ ...validEmployee, start_date: TODAY }, roles, templates, TODAY);
  assert.equal(res.valid, false);
  assert.deepEqual(fieldsOf(res), ['start_date']);
  assert.match(res.errors[0].message, /future/);
});

test('start date tomorrow is valid', () => {
  const res = validate({ ...validEmployee, start_date: '2026-01-06' }, roles, templates, TODAY);
  assert.equal(res.valid, true);
});

test('start date in the past is invalid', () => {
  const res = validate({ ...validEmployee, start_date: '2026-01-04' }, roles, templates, TODAY);
  assert.deepEqual(fieldsOf(res), ['start_date']);
  assert.match(res.errors[0].message, /future/);
});

test('malformed start date is reported as invalid format, not compared', () => {
  const res = validate({ ...validEmployee, start_date: '2026-13-01' }, roles, templates, TODAY);
  assert.deepEqual(fieldsOf(res), ['start_date']);
  assert.match(res.errors[0].message, /not a valid date/);
});

test('non-existent role is rejected', () => {
  const res = validate({ ...validEmployee, role: 'Astronaut' }, roles, templates, TODAY);
  assert.equal(res.valid, false);
  assert.ok(fieldsOf(res).includes('role'));
  assert.match(res.errors.find((e) => e.field === 'role').message, /does not exist/);
});

test('inactive role is rejected', () => {
  // Retired Role has no manager template selected, so manager id stays optional.
  const res = validate({ ...validEmployee, role: 'Retired Role', manager_telegram_id: '' }, roles, templates, TODAY);
  assert.ok(fieldsOf(res).includes('role'));
  assert.match(res.errors.find((e) => e.field === 'role').message, /inactive/);
});

test('role WITH manager tasks + empty manager id is invalid', () => {
  const res = validate({ ...validEmployee, manager_telegram_id: '' }, roles, templates, TODAY);
  assert.equal(res.valid, false);
  assert.deepEqual(fieldsOf(res), ['manager_telegram_id']);
});

test('role WITHOUT manager tasks + empty manager id is valid', () => {
  // Service Technician's only manager template is inactive -> manager id not required.
  const res = validate(
    { ...validEmployee, role: 'Service Technician', manager_telegram_id: '' },
    roles,
    templates,
    TODAY,
  );
  assert.deepEqual(res, { valid: true, errors: [] });
});

test('role WITH manager tasks + filled manager id is valid', () => {
  const res = validate(validEmployee, roles, templates, TODAY);
  assert.equal(res.valid, true);
});

test('email format: rejects missing @, double @, and dotless domain; accepts a normal address', () => {
  const bad = (email) => validate({ ...validEmployee, work_email: email }, roles, templates, TODAY);
  assert.deepEqual(fieldsOf(bad('иван')), ['work_email']);      // no @
  assert.deepEqual(fieldsOf(bad('a@@b.com')), ['work_email']);  // two @
  assert.deepEqual(fieldsOf(bad('a@b')), ['work_email']);       // no dot in domain
  assert.deepEqual(fieldsOf(bad('@corp.com')), ['work_email']); // empty local part
  assert.equal(bad('jane@corp.com').valid, true);               // valid
});

test('empty email reports "required", not a format error', () => {
  const res = validate({ ...validEmployee, work_email: '' }, roles, templates, TODAY);
  assert.deepEqual(fieldsOf(res), ['work_email']);
  assert.match(res.errors[0].message, /required/);
});

test('default today (argument omitted) still enforces the future rule', () => {
  // No fixed reference passed -> module falls back to UTC today (date-only).
  const past = validate({ ...validEmployee, start_date: '2000-01-01' }, roles, templates);
  assert.equal(past.valid, false);
  assert.ok(fieldsOf(past).includes('start_date'));

  const future = validate({ ...validEmployee, start_date: '2999-01-01' }, roles, templates);
  assert.equal(future.valid, true);
});
