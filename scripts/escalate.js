// escalate.js — pure logic for F5 (daily overdue escalation to HR).
//
// No network, no Date.now(). `today` is injected as an ISO date (office-local, computed in
// the wrapper) so the day boundary is testable.

import { parseISO } from './dates.js';

const DAY_MS = 86_400_000;

/**
 * Overdue tasks to escalate: Pending, due STRICTLY before today (a task due today is not
 * overdue), and not already escalated today (idempotent across re-runs via Escalated_On).
 */
export function selectOverdue(tasks, today) {
  return tasks.filter(
    (t) => t.status === 'Pending' && String(t.due_date) < today && String(t.escalated_on || '') !== today,
  );
}

/** Whole calendar days a task is overdue (today − due_date). */
export function daysOverdue(dueDate, today) {
  return Math.round((parseISO(today) - parseISO(dueDate)) / DAY_MS);
}

/**
 * One update per overdue task: bump Escalation_Count and stamp Escalated_On = today.
 * Escalated_On is what stops a second run the same day from escalating again.
 */
export function escalationUpdates(tasks, today) {
  return tasks.map((t) => ({
    id: t.id,
    Escalation_Count: Number(t.escalation_count || 0) + 1,
    Escalated_On: today,
  }));
}

/**
 * Build the single grouped HR summary for the overdue tasks, grouped by new hire.
 * @returns {{ text: string, count: number }}
 */
export function buildEscalationSummary(tasks, today) {
  const byEmployee = new Map();
  for (const t of tasks) {
    if (!byEmployee.has(t.employee_id)) byEmployee.set(t.employee_id, []);
    byEmployee.get(t.employee_id).push(t);
  }

  const lines = [`Overdue onboarding tasks (${tasks.length}):`];
  for (const [, empTasks] of byEmployee) {
    lines.push('', empTasks[0].employee_name || '(unknown employee)');
    for (const t of empTasks) {
      const n = daysOverdue(t.due_date, today);
      lines.push(`  ${t.title} — ${t.assignee_role}, due ${t.due_date} (${n}d overdue)`);
    }
  }
  return { text: lines.join('\n'), count: tasks.length };
}
