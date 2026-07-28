// n8n Code node — "Select Overdue" (F5)  (THIN WRAPPER — do not put logic here)
// Core (dates.js + escalate.js) inlined by `npm run build:nodes`. Paste escalate.built.js.
//
// Input: Pending Onboarding_Tasks. Ref: "Fetch Employees" (live name). Env: OFFICE_TIMEZONE.
// Output: one item per OVERDUE task, carrying the fields the update and the summary need
// (Escalation_Count already bumped, Escalated_On = today). No overdue tasks -> no items ->
// the bump and the HR summary downstream simply do not run.

/* __CORE__ */

const flat = (v) => (Array.isArray(v) ? v[0] : v);
const tz = $env.OFFICE_TIMEZONE || 'UTC';
const today = new Date().toLocaleDateString('en-CA', { timeZone: tz });

const empById = {};
for (const i of $('Fetch Employees').all()) empById[i.json.id] = { name: i.json.Full_Name };

const tasks = items.map((i) => {
  const f = i.json;
  const employee_id = flat(f.Employee);
  return {
    id: f.id, title: f.Title, due_date: f.Due_Date, status: f.Status,
    escalated_on: f.Escalated_On || '', escalation_count: f.Escalation_Count,
    assignee_role: f.Assignee_Role, employee_id, employee_name: (empById[employee_id] || {}).name,
  };
});

const overdue = selectOverdue(tasks, today);
const bumpById = Object.fromEntries(escalationUpdates(overdue, today).map((u) => [u.id, u]));
return overdue.map((t) => ({ json: { ...t, Escalation_Count: bumpById[t.id].Escalation_Count, Escalated_On: today, _today: today } }));
