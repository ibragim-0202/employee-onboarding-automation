// expandTemplates.js — turn an employee + role templates into dated, assigned tasks.
//
// Pure and side-effect free: no network, no notifications. It returns
// `{ tasks, warnings }`; F2 (the n8n workflow) is responsible for de-duping against
// existing Task_Keys, writing the records, and messaging HR about the warnings.
//
// Shapes (plain values, as they arrive from Airtable rows in n8n):
//   employee  { id, full_name, work_email, role, start_date, manager_telegram_id }
//     - id: Airtable record id (the stable half of Task_Key)
//     - role: role name string, matched against template.role
//     - start_date: ISO YYYY-MM-DD
//   template  { id, title, description, role, applies_to_all, assignee_role, day_offset, active }
//   assignee  { name, assignee_role, telegram_id, active }
//
// Each returned task uses Airtable field names so the n8n Code node can write it
// almost verbatim (link fields Employee/Template are record ids; wrap as [id] on write).

import { dueDateFromOffset } from './dates.js';

const MANAGER_ROLE = 'Manager';

/**
 * A template is expanded for a role if it is active and either universal or role-matched.
 * Exported so validate.js applies the exact same selection when checking the Manager rule.
 */
export function appliesToRole(template, role) {
  if (!template.active) return false;
  return template.applies_to_all === true || template.role === role;
}

/**
 * Resolve the Telegram id for a task's assignee role.
 * Manager resolves to the employee's own manager; every other role to the first active
 * assignee with that role. Returns { telegram_id, reason } — reason is set only on a miss.
 */
function resolveAssignee(assigneeRole, employee, assignees) {
  if (assigneeRole === MANAGER_ROLE) {
    const managerId = employee.manager_telegram_id;
    if (managerId) return { telegram_id: managerId };
    return { telegram_id: '', reason: 'Employee has no Manager_Telegram_ID' };
  }
  const match = assignees.find((a) => a.active && a.assignee_role === assigneeRole);
  if (match && match.telegram_id) return { telegram_id: match.telegram_id };
  return { telegram_id: '', reason: `No active assignee configured for role "${assigneeRole}"` };
}

/**
 * Expand a role's task templates into concrete onboarding tasks for one employee.
 * @returns {{ tasks: object[], warnings: {task_key:string, assignee_role:string, reason:string}[] }}
 */
export function expandTemplates(employee, templates, assignees) {
  const tasks = [];
  const warnings = [];

  for (const template of templates) {
    if (!appliesToRole(template, employee.role)) continue;

    const taskKey = `${employee.id}::${template.id}`;
    const { telegram_id, reason } = resolveAssignee(template.assignee_role, employee, assignees);
    const unresolved = reason !== undefined;

    if (unresolved) {
      warnings.push({ task_key: taskKey, assignee_role: template.assignee_role, reason });
    }

    tasks.push({
      Task_Key: taskKey,
      Employee: employee.id,        // link (wrap as [id] when writing to Airtable)
      Template: template.id,        // link
      Title: template.title,        // snapshot at creation
      Description: template.description,
      Assignee_Role: template.assignee_role,
      Blocking: template.blocking === true, // snapshot, not read live from the template
      Assignee_Telegram_ID: telegram_id,
      Due_Date: dueDateFromOffset(employee.start_date, template.day_offset),
      Status: 'Pending',
      Unresolved_Assignee: unresolved,
    });
  }

  return { tasks, warnings };
}
