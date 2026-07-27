// n8n Code node — "Complete Check" (F4)  (THIN WRAPPER — do not put logic here)
// Core (notify.js) inlined by `npm run build:nodes`. Paste completeCheck.built.js.
//
// Input: all of the employee's tasks (fetched AFTER the update committed). Ref: "Resolve".
// Output: { complete, employee_id } — complete=true when nothing is Pending anymore.

/* __CORE__ */

const tasks = items.map((i) => ({ status: i.json.Status }));
return [{ json: {
  complete: isEmployeeComplete(tasks),
  employee_id: $('Resolve').first().json.employee_id,
} }];
