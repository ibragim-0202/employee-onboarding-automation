// build-workflow-intake.js — assemble workflows/01-intake.json (F1 + F2).
//   npm run build:intake   (run `npm run build:nodes` first)
//
// The node graph is defined here as plain objects (so it is reviewable and produces
// valid JSON), and the two heavy Code nodes get the VERIFIED built code inlined from
// workflows/code-nodes/*.built.js. Small n8n-only glue (dedupe, status collect, HR
// summary) lives inline below — it is glue, not business logic.
//
// NOT verified against a live n8n: node typeVersions and some parameter names may need
// a tweak on import, and Airtable/Telegram credentials must be attached after import.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const nodesDir = join(root, 'workflows', 'code-nodes');
const built = (name) => readFileSync(join(nodesDir, `${name}.built.js`), 'utf8');

// --- inline n8n glue (not business logic) ----------------------------------

const DEDUPE = `// Dedupe by Task_Key — create-only. Input items = existing Onboarding_Tasks.
const existing = new Set(items.map((i) => i.json.Task_Key));
return $('Expand Templates').all().filter((t) => !existing.has(t.json.Task_Key));`;

const COLLECT_EMPLOYEES = `// One item per valid employee id, for the status update.
const seen = new Set();
const out = [];
for (const it of $('Validate').all()) {
  if (it.json._valid && !seen.has(it.json.id)) { seen.add(it.json.id); out.push({ json: { id: it.json.id } }); }
}
return out;`;

// Narrow filter for "Fetch Existing Tasks": only the employees in THIS batch, never a
// full-table scan. Task_Key starts with the employee record id, so FIND('<id>::', ...)
// selects exactly that employee's existing tasks. Falls back to FALSE() (matches nothing)
// when there is nothing to expand.
const EXISTING_TASKS_FILTER =
  "={{ (() => { const ids = [...new Set($('Expand Templates').all().map(t => Array.isArray(t.json.Employee) ? t.json.Employee[0] : t.json.Employee))]; " +
  "return ids.length ? 'OR(' + ids.map(id => \"FIND('\" + id + \"::', {Task_Key}) > 0\").join(', ') + ')' : 'FALSE()'; })() }}";

const HR_SUMMARY = `// One HR summary from the tasks we just created that have no assignee.
const created = $('Dedupe by Task_Key').all();
const unresolved = created.filter((t) => t.json.Unresolved_Assignee === true);
if (unresolved.length === 0) return [{ json: { hasWarnings: false, message: '' } }];
const byEmp = {};
for (const t of unresolved) { (byEmp[t.json.Employee] ??= []).push(t.json.Title); }
const lines = Object.entries(byEmp).map(([emp, titles]) => \`- \${emp}: \${titles.length} task(s) — \${titles.join(', ')}\`);
const message = \`Onboarding created, but \${unresolved.length} task(s) have no assignee. Check the assignee config:\\n\` + lines.join('\\n');
return [{ json: { hasWarnings: true, message } }];`;

// --- helpers ----------------------------------------------------------------

const BASE = { __rl: true, mode: 'id', value: '={{ $env.AIRTABLE_BASE_ID }}' };
const table = (name) => ({ __rl: true, mode: 'name', value: name });

function airtableSearch(name, tableName, formula, pos) {
  return {
    parameters: {
      resource: 'record', operation: 'search',
      base: BASE, table: table(tableName),
      filterByFormula: formula, options: {},
    },
    id: name, name, type: 'n8n-nodes-base.airtable', typeVersion: 2.1,
    position: pos, executeOnce: true,
    notes: 'Attach Airtable Personal Access Token credential after import.',
  };
}
function codeNode(name, jsCode, pos) {
  return {
    parameters: { language: 'javaScript', jsCode },
    id: name, name, type: 'n8n-nodes-base.code', typeVersion: 2, position: pos,
  };
}
function telegram(name, textExpr, pos) {
  return {
    parameters: {
      resource: 'message', operation: 'sendMessage',
      chatId: '={{ $env.TELEGRAM_HR_CHAT_ID }}', text: textExpr, additionalFields: {},
    },
    id: name, name, type: 'n8n-nodes-base.telegram', typeVersion: 1.2, position: pos,
    notes: 'Attach Telegram Bot API credential after import.',
  };
}

// --- nodes ------------------------------------------------------------------

const nodes = [
  { parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 1 }] } },
    id: 'Schedule Trigger', name: 'Schedule Trigger', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: [-400, 300] },

  airtableSearch('Fetch Active Roles', 'Roles', '{Active} = TRUE()', [-180, 300]),
  airtableSearch('Fetch Active Templates', 'Task_Templates', '{Active} = TRUE()', [40, 300]),
  airtableSearch('Fetch Active Assignees', 'Assignees', '{Active} = TRUE()', [260, 300]),
  airtableSearch('Fetch New Employees', 'Employees', "{Status} = 'New'", [480, 300]),

  codeNode('Validate', built('validate'), [700, 300]),

  { parameters: {
      conditions: { options: { caseSensitive: true, typeValidation: 'strict' }, combinator: 'and',
        conditions: [{ leftValue: '={{ $json._valid }}', rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }] } },
    id: 'IF Valid', name: 'IF Valid', type: 'n8n-nodes-base.if', typeVersion: 2, position: [920, 300] },

  // invalid branch
  { parameters: {
      resource: 'record', operation: 'update', base: BASE, table: table('Employees'),
      columns: { mappingMode: 'defineBelow', value: {
        id: '={{ $json.id }}', Status: 'Error',
        Validation_Notes: "={{ $json._errors.map(e => e.field + ': ' + e.message).join('; ') }}" } }, options: {} },
    id: 'Mark Error', name: 'Mark Error', type: 'n8n-nodes-base.airtable', typeVersion: 2.1, position: [1140, 460],
    notes: 'Attach Airtable credential after import.' },
  telegram('Notify HR (invalid)',
    "=Onboarding intake failed for {{ $json.Full_Name }}:\n{{ $json._errors.map(e => '- ' + e.message).join('\\n') }}",
    [1360, 460]),

  // valid branch
  codeNode('Expand Templates', built('expandTemplates'), [1140, 160]),
  { ...airtableSearch('Fetch Existing Tasks', 'Onboarding_Tasks', EXISTING_TASKS_FILTER, [1360, 160]),
    alwaysOutputData: true }, // no existing tasks -> still emit an (empty) item so Dedupe/Create run on first onboarding
  codeNode('Dedupe by Task_Key', DEDUPE, [1580, 160]),
  { parameters: {
      resource: 'record', operation: 'create', base: BASE, table: table('Onboarding_Tasks'),
      columns: { mappingMode: 'autoMapInputData' }, options: { bulkSize: 10 } },
    id: 'Create Tasks', name: 'Create Tasks', type: 'n8n-nodes-base.airtable', typeVersion: 2.1, position: [1800, 160],
    notes: 'Link fields Employee/Template take record ids; wrap as [id] if your Airtable node expects arrays.' },

  // status update + HR summary
  codeNode('Collect Valid Employees', COLLECT_EMPLOYEES, [2020, 60]),
  { parameters: {
      resource: 'record', operation: 'update', base: BASE, table: table('Employees'),
      columns: { mappingMode: 'defineBelow', value: { id: '={{ $json.id }}', Status: 'Onboarding' } }, options: {} },
    id: 'Mark Onboarding', name: 'Mark Onboarding', type: 'n8n-nodes-base.airtable', typeVersion: 2.1, position: [2240, 60],
    notes: 'Attach Airtable credential after import.' },

  codeNode('HR Warnings Summary', HR_SUMMARY, [2020, 260]),
  { parameters: {
      conditions: { options: { caseSensitive: true, typeValidation: 'strict' }, combinator: 'and',
        conditions: [{ leftValue: '={{ $json.hasWarnings }}', rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }] } },
    id: 'IF Has Warnings', name: 'IF Has Warnings', type: 'n8n-nodes-base.if', typeVersion: 2, position: [2240, 260] },
  telegram('Notify HR (warnings)', '={{ $json.message }}', [2460, 260]),
];

// --- connections ------------------------------------------------------------

const chain = (from, to) => ({ [from]: { main: [[{ node: to, type: 'main', index: 0 }]] } });
const connections = {
  ...chain('Schedule Trigger', 'Fetch Active Roles'),
  ...chain('Fetch Active Roles', 'Fetch Active Templates'),
  ...chain('Fetch Active Templates', 'Fetch Active Assignees'),
  ...chain('Fetch Active Assignees', 'Fetch New Employees'),
  ...chain('Fetch New Employees', 'Validate'),
  ...chain('Validate', 'IF Valid'),
  'IF Valid': { main: [
    [{ node: 'Expand Templates', type: 'main', index: 0 }],  // true
    [{ node: 'Mark Error', type: 'main', index: 0 }],        // false
  ] },
  ...chain('Mark Error', 'Notify HR (invalid)'),
  ...chain('Expand Templates', 'Fetch Existing Tasks'),
  ...chain('Fetch Existing Tasks', 'Dedupe by Task_Key'),
  ...chain('Dedupe by Task_Key', 'Create Tasks'),
  'Create Tasks': { main: [[
    { node: 'Collect Valid Employees', type: 'main', index: 0 },
    { node: 'HR Warnings Summary', type: 'main', index: 0 },
  ]] },
  ...chain('Collect Valid Employees', 'Mark Onboarding'),
  ...chain('HR Warnings Summary', 'IF Has Warnings'),
  'IF Has Warnings': { main: [
    [{ node: 'Notify HR (warnings)', type: 'main', index: 0 }], // true
    [], // false: nothing
  ] },
};

const workflow = {
  name: '01 - Intake (F1 + F2)',
  nodes,
  connections,
  active: false,
  settings: { executionOrder: 'v1' },
  pinData: {},
  meta: { note: 'Set Settings -> Error Workflow to an error handler that messages HR (SPEC: no silent failures). Credentials are stripped; attach Airtable + Telegram after import.' },
};

const outPath = join(root, 'workflows', '01-intake.json');
writeFileSync(outPath, `${JSON.stringify(workflow, null, 2)}\n`);
console.log(`built workflows/01-intake.json  (${nodes.length} nodes, ${Object.keys(connections).length} connections)`);
