// n8n Code node — "HR Summary" (F5)  (THIN WRAPPER — do not put logic here)
// Core (dates.js + escalate.js) inlined by `npm run build:nodes`. Paste escalateSummary.built.js.
//
// Input: the overdue tasks from "Select Overdue". Output: a single { text, count } — one
// grouped HR message, never one per task.

/* __CORE__ */

if (items.length === 0) return [];
const today = items[0].json._today;
const tasks = items.map((i) => {
  const f = i.json;
  return { title: f.title, due_date: f.due_date, assignee_role: f.assignee_role, employee_id: f.employee_id, employee_name: f.employee_name };
});
const { text, count } = buildEscalationSummary(tasks, today);
return [{ json: { text, count } }];
