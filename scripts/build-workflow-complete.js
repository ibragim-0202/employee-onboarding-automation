// build-workflow-complete.js — assemble workflows/03-complete.json (F4).
//   npm run build:complete   (run `npm run build:nodes` first)
//
// Telegram callback -> parse (strict) -> fetch task -> resolve (authorize + idempotency)
// -> branch: unauthorized / already-final / apply. Apply updates the task, then (only after
// the write commits, guaranteed by node order) re-fetches the employee's tasks to maybe set
// Complete, re-fetches the message's sibling tasks and edits the message to its current state.
// Every branch answers the callback query.
//
// The Telegram TRIGGER must be the SAME bot as TELEGRAM_BOT_TOKEN (used for edit/answer here
// and for sending in F3) — otherwise callbacks arrive on a different bot.
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
const AT = 'n8n-nodes-base.airtable';

const codeNode = (name, jsCode, pos) => ({
  parameters: { language: 'javaScript', jsCode }, id: name, name, type: 'n8n-nodes-base.code', typeVersion: 2, position: pos,
});
const airtable = (name, params, pos) => ({
  parameters: { base: BASE, ...params }, id: name, name, type: AT, typeVersion: 2.1, position: pos,
  notes: 'Attach Airtable credential after import.',
});
const search = (name, tableName, formula, pos) =>
  airtable(name, { resource: 'record', operation: 'search', table: table(tableName), filterByFormula: formula, options: {} }, { ...pos });
const telegramPost = (name, method, jsonBody, pos) => ({
  parameters: { method: 'POST', url: `=https://api.telegram.org/bot{{ $env.TELEGRAM_BOT_TOKEN }}/${method}`, sendBody: true, specifyBody: 'json', jsonBody, options: {} },
  id: name, name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos,
});
const ifTrue = (name, expr, pos) => ({
  parameters: { conditions: { options: { caseSensitive: true, typeValidation: 'strict' }, combinator: 'and',
    conditions: [{ leftValue: expr, rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }] } },
  id: name, name, type: 'n8n-nodes-base.if', typeVersion: 2, position: pos,
});
const outcomeRule = (value) => ({
  conditions: { options: { caseSensitive: true, typeValidation: 'strict' }, combinator: 'and',
    conditions: [{ leftValue: '={{ $json.outcome }}', rightValue: value, operator: { type: 'string', operation: 'equals' } }] },
  outputKey: value,
});

const nodes = [
  { parameters: { updates: ['callback_query'], additionalFields: {} },
    id: 'On Callback', name: 'On Callback', type: 'n8n-nodes-base.telegramTrigger', typeVersion: 1.2, position: [-560, 300],
    notes: 'Attach the Telegram credential for the SAME bot as TELEGRAM_BOT_TOKEN.' },

  codeNode('Parse Callback', built('completeParse'), [-340, 300]),
  ifTrue('IF Recognized', '={{ $json.ignore === false }}', [-120, 300]),

  telegramPost('Answer Unknown', 'answerCallbackQuery',
    "={{ JSON.stringify({ callback_query_id: $json.callback_query_id, text: 'Unknown or expired action' }) }}", [100, 480]),

  airtable('Fetch Task', { resource: 'record', operation: 'get', table: table('Onboarding_Tasks'),
    id: "={{ $('Parse Callback').first().json.taskId }}", options: {} }, [100, 300]),

  codeNode('Resolve', built('completeResolve'), [320, 300]),

  { parameters: { rules: { values: [outcomeRule('unauthorized'), outcomeRule('already-final'), outcomeRule('apply')] }, options: {} },
    id: 'Switch Outcome', name: 'Switch Outcome', type: 'n8n-nodes-base.switch', typeVersion: 3, position: [540, 300] },

  telegramPost('Answer Unauthorized', 'answerCallbackQuery',
    '={{ JSON.stringify({ callback_query_id: $json.callback_query_id, text: $json.answerText, show_alert: true }) }}', [760, 120]),

  // apply branch
  airtable('Update Task', { resource: 'record', operation: 'update', table: table('Onboarding_Tasks'),
    columns: { mappingMode: 'defineBelow', value: {
      id: '={{ $json.task_id }}', Status: '={{ $json.status }}',
      Completed_At: '={{ $now.toISO() }}', Completed_By: '={{ $json.completed_by }}' } }, options: {} }, [760, 300]),
  search('Fetch Employee Tasks', 'Onboarding_Tasks',
    '={{ "FIND(\'" + $(\'Resolve\').first().json.employee_id + "::\', {Task_Key}) > 0" }}', [980, 300]),
  codeNode('Complete Check', built('completeCheck'), [1200, 300]),
  ifTrue('IF Employee Complete', '={{ $json.complete === true }}', [1420, 300]),
  airtable('Mark Employee Complete', { resource: 'record', operation: 'update', table: table('Employees'),
    columns: { mappingMode: 'defineBelow', value: { id: '={{ $json.employee_id }}', Status: 'Complete' } }, options: {} }, [1640, 200]),

  // shared re-render tail (runs after the update has committed)
  search('Fetch Employees', 'Employees', '', [1860, 300]),
  search('Fetch Siblings', 'Onboarding_Tasks',
    '={{ "{Telegram_Message_ID} = \'" + $(\'Resolve\').first().json.telegram_message_id + "\'" }}', [2080, 300]),
  codeNode('Build Edit', built('completeRender'), [2300, 300]),
  telegramPost('Edit Message', 'editMessageText', '={{ $json.editBody }}', [2520, 300]),
  telegramPost('Answer Callback', 'answerCallbackQuery',
    '={{ JSON.stringify({ callback_query_id: $json.callback_query_id, text: $json.answerText }) }}', [2740, 300]),
];

// executeOnce on the multi-row fetches so they run once instead of per input item.
for (const n of nodes) {
  if (['Fetch Employee Tasks', 'Fetch Employees', 'Fetch Siblings'].includes(n.name)) n.executeOnce = true;
}

const chain = (from, to) => ({ [from]: { main: [[{ node: to, type: 'main', index: 0 }]] } });
const connections = {
  ...chain('On Callback', 'Parse Callback'),
  ...chain('Parse Callback', 'IF Recognized'),
  'IF Recognized': { main: [
    [{ node: 'Fetch Task', type: 'main', index: 0 }],       // true
    [{ node: 'Answer Unknown', type: 'main', index: 0 }],   // false
  ] },
  ...chain('Fetch Task', 'Resolve'),
  ...chain('Resolve', 'Switch Outcome'),
  'Switch Outcome': { main: [
    [{ node: 'Answer Unauthorized', type: 'main', index: 0 }], // unauthorized
    [{ node: 'Fetch Employees', type: 'main', index: 0 }],     // already-final -> re-render only
    [{ node: 'Update Task', type: 'main', index: 0 }],         // apply
  ] },
  ...chain('Update Task', 'Fetch Employee Tasks'),
  ...chain('Fetch Employee Tasks', 'Complete Check'),
  ...chain('Complete Check', 'IF Employee Complete'),
  'IF Employee Complete': { main: [
    [{ node: 'Mark Employee Complete', type: 'main', index: 0 }], // true
    [{ node: 'Fetch Employees', type: 'main', index: 0 }],        // false
  ] },
  ...chain('Mark Employee Complete', 'Fetch Employees'),
  ...chain('Fetch Employees', 'Fetch Siblings'),
  ...chain('Fetch Siblings', 'Build Edit'),
  ...chain('Build Edit', 'Edit Message'),
  ...chain('Edit Message', 'Answer Callback'),
};

const workflow = {
  name: '03 - Complete (F4)',
  nodes, connections, active: false,
  settings: { executionOrder: 'v1' },
  pinData: {},
  meta: { note: 'Telegram Trigger must be the SAME bot as TELEGRAM_BOT_TOKEN. Re-render (Fetch Siblings) is downstream of Update Task by connection order, so it sees the committed state. Callback race between Fetch Task and Update Task is a documented, harmless limitation (see SPEC F4). Set Settings -> Error Workflow to notify HR.' },
};

writeFileSync(join(root, 'workflows', '03-complete.json'), `${JSON.stringify(workflow, null, 2)}\n`);
console.log(`built workflows/03-complete.json  (${nodes.length} nodes, ${Object.keys(connections).length} connections)`);
