// n8n Code node — "Build Messages" (F3)  (THIN WRAPPER — do not put logic here)
//
// Core (notify.js) is inlined by `npm run build:nodes`. Edit logic in scripts/notify.js.
// Paste the BUILT file (notify.built.js) into the n8n Code node.
//
// Upstream node names (rename the strings below if your workflow differs):
//   input items         -> Pending, un-notified Onboarding_Tasks
//   "Fetch Employees"   -> Employees rows (live name + start date, joined not snapshotted)
// Env: OFFICE_TIMEZONE.
//
// Output: one item per assignee = { assignee_telegram_id, text, reply_markup, task_ids }.
// Unresolved tasks (empty assignee) are skipped — there is no one to message; they wait
// until HR fixes the assignee, then a later run picks them up.

/* __CORE__ */

// --- n8n glue ---------------------------------------------------------------
const flat = (v) => (Array.isArray(v) ? v[0] : v);
const tz = $env.OFFICE_TIMEZONE || 'UTC';
const today = officeToday(new Date(), tz);

const empById = {};
for (const i of $('Fetch Employees').all()) {
  empById[i.json.id] = { name: i.json.Full_Name, start_date: i.json.Start_Date };
}

const tasks = items.map((i) => {
  const f = i.json;
  const employee_id = flat(f.Employee);
  const emp = empById[employee_id] || {};
  return {
    id: f.id,
    title: f.Title,
    due_date: f.Due_Date,
    blocking: f.Blocking === true,
    assignee_telegram_id: f.Assignee_Telegram_ID,
    status: f.Status,
    notified_at: f.Notified_At || '',
    employee_id,
    employee_name: emp.name,
    start_date: emp.start_date,
  };
});

return groupByAssignee(selectDueTasks(tasks, today))
  .filter((g) => g.assignee_telegram_id && g.assignee_telegram_id !== 'undefined')
  .map((g) => {
    const { text, inline_keyboard } = renderMessage(g.tasks);
    return { json: { assignee_telegram_id: g.assignee_telegram_id, text, reply_markup: { inline_keyboard }, task_ids: g.tasks.map((t) => t.id) } };
  });
