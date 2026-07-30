// build-workflow-escalate.js — assemble workflows/04-escalate.json (F5).
//   npm run build:escalate   (run `npm run build:nodes` first)
//
// Daily 18:00 (office tz in workflow settings.timezone): find overdue Pending tasks not yet
// escalated today, bump Escalation_Count + stamp Escalated_On, and send ONE grouped summary
// to HR. No overdue tasks -> the bump and the HR message simply do not run.
//
// NOT verified against a live n8n — typeVersions / param names may need a tweak on import.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const nodesDir = join(root, 'workflows', 'code-nodes');
const built = (name) => readFileSync(join(nodesDir, `${name}.built.js`), 'utf8');

const BASE = { __rl: true, mode: 'id', value: '={{ $env.AIRTABLE_BASE_ID }}' };
const table = (name) => ({ __rl: true, mode: 'name', value: name });

function airtableSearch(name, tableName, formula, pos) {
  return {
    parameters: { resource: 'record', operation: 'search', base: BASE, table: table(tableName), filterByFormula: formula, options: {} },
    id: name, name, type: 'n8n-nodes-base.airtable', typeVersion: 2.1, position: pos, executeOnce: true,
    notes: 'Attach Airtable credential after import.',
  };
}
const codeNode = (name, jsCode, pos) => ({
  parameters: { language: 'javaScript', jsCode }, id: name, name, type: 'n8n-nodes-base.code', typeVersion: 2, position: pos,
});

const nodes = [
  { parameters: { rule: { interval: [{ field: 'cronExpression', expression: '0 18 * * *' }] } },
    id: 'Schedule 18:00', name: 'Schedule 18:00', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: [-400, 300],
    notes: 'Office tz comes from workflow Settings -> Timezone (Europe/Istanbul).' },

  airtableSearch('Fetch Employees', 'Employees', '', [-180, 300]),
  airtableSearch('Fetch Pending Tasks', 'Onboarding_Tasks', "{Status} = 'Pending'", [40, 300]),

  codeNode('Select Overdue', built('escalate'), [260, 300]),

  // bump path
  { parameters: {
      resource: 'record', operation: 'update', base: BASE, table: table('Onboarding_Tasks'),
      columns: { mappingMode: 'autoMapInputData' }, options: { bulkSize: 10 } },
    id: 'Bump Escalation', name: 'Bump Escalation', type: 'n8n-nodes-base.airtable', typeVersion: 2.1, position: [480, 200],
    notes: 'Attach Airtable credential after import.' },

  // summary path
  codeNode('HR Summary', built('escalateSummary'), [480, 420]),
  { parameters: {
      method: 'POST', url: '=https://api.telegram.org/bot{{ $env.TELEGRAM_BOT_TOKEN }}/sendMessage',
      sendBody: true, specifyBody: 'json',
      jsonBody: '={{ JSON.stringify({ chat_id: $env.TELEGRAM_HR_CHAT_ID, text: $json.text }) }}', options: {} },
    id: 'Send HR Summary', name: 'Send HR Summary', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [700, 420] },
];

const chain = (from, to) => ({ [from]: { main: [[{ node: to, type: 'main', index: 0 }]] } });
const connections = {
  ...chain('Schedule 18:00', 'Fetch Employees'),
  ...chain('Fetch Employees', 'Fetch Pending Tasks'),
  ...chain('Fetch Pending Tasks', 'Select Overdue'),
  'Select Overdue': { main: [[
    { node: 'Bump Escalation', type: 'main', index: 0 },
    { node: 'HR Summary', type: 'main', index: 0 },
  ]] },
  ...chain('HR Summary', 'Send HR Summary'),
};

const workflow = {
  name: '04 - Escalate (F5)',
  nodes, connections, active: false,
  settings: { executionOrder: 'v1', timezone: 'Europe/Istanbul' },
  pinData: {},
  meta: { note: 'Day boundary + once-per-day guard (Escalated_On) handled in code. No overdue tasks -> no bump, no message. Set Settings -> Error Workflow to notify HR. TELEGRAM_BOT_TOKEN / TELEGRAM_HR_CHAT_ID + Airtable credential required.' },
};

writeFileSync(join(root, 'workflows', '04-escalate.json'), `${JSON.stringify(workflow, null, 2)}\n`);
console.log(`built workflows/04-escalate.json  (${nodes.length} nodes, ${Object.keys(connections).length} connections)`);
