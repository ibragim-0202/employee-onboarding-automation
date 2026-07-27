// n8n Code node — "Expand templates"  (THIN WRAPPER — do not put logic here)
//
// The core (expandTemplates + its deps) is inlined by `npm run build:nodes` from
// scripts/ verbatim, replacing the __CORE__ marker. Edit logic in scripts/, never
// here. Paste the BUILT file (expandTemplates.built.js) into the n8n Code node.
//
// Upstream node names (rename the strings below if your workflow differs):
//   input items              -> valid employee records (IF "true" branch)
//   "Fetch Active Templates" -> Task_Templates rows
//   "Fetch Active Assignees" -> Assignees rows
//
// Output: one item PER TASK (json = Onboarding_Tasks fields). Unresolved assignees
// carry Unresolved_Assignee = true; the HR summary downstream is derived from those.

/* __CORE__ */

// --- n8n glue ---------------------------------------------------------------
const flat = (v) => (Array.isArray(v) ? v[0] : v);

const templates = $('Fetch Active Templates').all().map((i) => ({
  id: i.json.id,
  title: i.json.Title,
  description: i.json.Description,
  role: flat(i.json.Role_Name) ?? null,
  applies_to_all: i.json.Applies_To_All === true,
  assignee_role: i.json.Assignee_Role,
  day_offset: Number(i.json.Day_Offset),
  active: i.json.Active === true,
}));

const assignees = $('Fetch Active Assignees').all().map((i) => ({
  assignee_role: i.json.Assignee_Role,
  telegram_id: i.json.Telegram_ID != null ? String(i.json.Telegram_ID) : '',
  active: i.json.Active === true,
}));

const out = [];
for (const item of items) {
  const f = item.json;
  const employee = {
    id: f.id,
    role: flat(f.Role_Name),
    start_date: f.Start_Date,
    manager_telegram_id: f.Manager_Telegram_ID,
  };
  const { tasks } = expandTemplates(employee, templates, assignees);
  for (const task of tasks) out.push({ json: task });
}
return out;
