// validate.js — new-hire intake validation (SPEC F1, step 1).
//
// Pure: collects ALL errors instead of throwing on the first, so HR sees every
// problem at once. Returns { valid, errors }, errors = [{ field, message }].
//
// `today` is injected (ISO YYYY-MM-DD) so the module stays testable and timezone-free.
// n8n must pass today's date in OFFICE_TIMEZONE; the default is UTC today as a fallback.

import { parseISO } from './dates.js';
import { appliesToRole } from './expandTemplates.js';

const REQUIRED_FIELDS = [
  ['full_name', 'Full name'],
  ['work_email', 'Work email'],
  ['role', 'Role'],
  ['department', 'Department'],
  ['start_date', 'Start date'],
];

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === '';
}

// Deliberately not an RFC regex — just enough to keep a broken address out of the
// dedupe key (F1) and IT's mailbox task: exactly one "@", both sides non-empty,
// and a dot inside the domain that is neither first nor last char.
function isValidEmail(value) {
  const parts = String(value).split('@');
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  if (local.trim() === '' || domain.trim() === '') return false;
  const dot = domain.indexOf('.');
  return dot > 0 && dot < domain.length - 1;
}

function utcTodayISO() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`;
}

/**
 * Validate a new-hire intake record.
 * @param {object} employee - { full_name, work_email, role, department, start_date, manager_telegram_id }
 * @param {object[]} roles - [{ role_name, active }]
 * @param {object[]} templates - [{ role, applies_to_all, assignee_role, active, ... }]
 * @param {string} [today] - ISO YYYY-MM-DD reference for "future"; defaults to UTC today
 * @returns {{ valid: boolean, errors: {field: string, message: string}[] }}
 */
export function validate(employee, roles, templates, today = utcTodayISO()) {
  const errors = [];
  const emp = employee ?? {};

  // 1. Required fields present.
  for (const [field, label] of REQUIRED_FIELDS) {
    if (isBlank(emp[field])) {
      errors.push({ field, message: `${label} is required` });
    }
  }

  // 2. Email format (only when present — emptiness is already covered above).
  if (!isBlank(emp.work_email) && !isValidEmail(emp.work_email)) {
    errors.push({ field: 'work_email', message: `Work email is not a valid email address: ${emp.work_email}` });
  }

  // 3. Start date: valid ISO and strictly in the future (today is not the future).
  if (!isBlank(emp.start_date)) {
    let startTs;
    try {
      startTs = parseISO(emp.start_date);
    } catch {
      errors.push({ field: 'start_date', message: `Start date is not a valid date: ${emp.start_date}` });
    }
    if (startTs !== undefined && startTs <= parseISO(today)) {
      errors.push({ field: 'start_date', message: 'Start date must be in the future' });
    }
  }

  // 4. Role exists and is active.
  const role = roles.find((r) => r.role_name === emp.role);
  if (!isBlank(emp.role)) {
    if (!role) {
      errors.push({ field: 'role', message: `Role does not exist: ${emp.role}` });
    } else if (!role.active) {
      errors.push({ field: 'role', message: `Role is inactive: ${emp.role}` });
    }
  }

  // 5. Manager rule: manager_telegram_id is required only if the role has at least one
  //    active template assigned to the Manager (same selection as F2 expansion).
  const needsManager = templates.some(
    (t) => appliesToRole(t, emp.role) && t.assignee_role === 'Manager',
  );
  if (needsManager && isBlank(emp.manager_telegram_id)) {
    errors.push({
      field: 'manager_telegram_id',
      message: 'Manager Telegram ID is required because this role has manager-assigned tasks',
    });
  }

  return { valid: errors.length === 0, errors };
}
