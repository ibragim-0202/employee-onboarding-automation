// n8n Code node — "Validate intake"  (THIN WRAPPER — do not put logic here)
//
// The core (validate + its deps) is inlined by `npm run build:nodes`, which reads
// scripts/ verbatim and replaces the __CORE__ marker below. Edit logic in scripts/,
// never here. Paste the BUILT file (validate.built.js) into the n8n Code node.
//
// Upstream node names (rename the strings below if your workflow differs):
//   input items              -> New employee records
//   "Fetch Active Roles"     -> Roles rows
//   "Fetch Active Templates" -> Task_Templates rows
// Env: OFFICE_TIMEZONE (falls back to UTC).
//
// Output: one item per employee = original fields + { _valid, _errors }.

/* __CORE__ */

// --- n8n glue ---------------------------------------------------------------
// Airtable lookups/links come back as arrays; take the first scalar.
const flat = (v) => (Array.isArray(v) ? v[0] : v);

const tz = $env.OFFICE_TIMEZONE || 'UTC';
// en-CA gives YYYY-MM-DD; formatting in the office tz yields "today" as a plain date.
const today = new Date().toLocaleDateString('en-CA', { timeZone: tz });

const roles = $('Fetch Active Roles').all().map((i) => ({
  role_name: i.json.Role_Name,
  active: i.json.Active === true,
}));

const templates = $('Fetch Active Templates').all().map((i) => ({
  role: flat(i.json.Role_Name) ?? null,
  applies_to_all: i.json.Applies_To_All === true,
  assignee_role: i.json.Assignee_Role,
  active: i.json.Active === true,
}));

return items.map((item) => {
  const f = item.json;
  const employee = {
    id: f.id,
    full_name: f.Full_Name,
    work_email: f.Work_Email,
    role: flat(f.Role_Name),
    department: f.Department,
    start_date: f.Start_Date,
    manager_telegram_id: f.Manager_Telegram_ID,
  };
  const { valid, errors } = validate(employee, roles, templates, today);
  return { json: { ...f, _valid: valid, _errors: errors } };
});
