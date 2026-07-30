// build-workflow-notify.js — assemble workflows/02-notify.json (F3).
//   npm run build:notify   (run `npm run build:nodes` first)
//
// Daily 09:00 (office tz, set in workflow settings.timezone): find due, un-notified tasks,
// send ONE grouped Telegram message per assignee, then write back Notified_At + the message
// id / chat id (so F4 can edit the message on a button tap).
//
// Resilience: "Send Telegram" continues on a failed send (bot blocked, bad chat id, rate
// limit) instead of halting. Results are matched back to their group by CHAT ID, never by
// position — a failed send simply finds no match, so its tasks stay un-notified (retried
// next run) instead of shifting everyone else's write-back. Unmatched groups are reported
// to HR (no silent failures).
//
// Telegram is called via HTTP Request, not the Telegram node: the inline keyboard is built
// dynamically in code, which the HTTP body passes through cleanly.
//
// NOT verified against a live n8n — typeVersions / param names may need a tweak on import;
// set TELEGRAM_BOT_TOKEN / TELEGRAM_HR_CHAT_ID and attach the Airtable credential after import.

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
const telegramPost = (name, method, jsonBody, pos) => ({
  parameters: {
    method: 'POST', url: `=https://api.telegram.org/bot{{ $env.TELEGRAM_BOT_TOKEN }}/${method}`,
    sendBody: true, specifyBody: 'json', jsonBody, options: {},
  },
  id: name, name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos,
});

// Match each Telegram result back to its group by chat id; emit one write-back per task.
const NOTIFIED_UPDATES = `const built = $('Build Messages').all();
const okByChat = {};
for (const s of $('Send Telegram').all()) { const r = s.json && s.json.result; if (r && r.chat) okByChat[String(r.chat.id)] = r; }
const now = new Date().toISOString();
const out = [];
for (const g of built) {
  const r = okByChat[String(g.json.assignee_telegram_id)];
  if (!r) continue; // no successful send for this group -> leave un-notified, retried next run
  for (const taskId of g.json.task_ids || []) {
    out.push({ json: { id: taskId, Notified_At: now, Telegram_Message_ID: String(r.message_id), Telegram_Chat_ID: String(r.chat.id) } });
  }
}
return out;`;

// Any group with no matching successful send = undelivered -> one summary to HR.
const FAILED_SENDS = `const okChats = new Set();
for (const s of $('Send Telegram').all()) { const r = s.json && s.json.result; if (r && r.chat) okChats.add(String(r.chat.id)); }
const failed = $('Build Messages').all().filter((g) => !okChats.has(String(g.json.assignee_telegram_id)));
if (failed.length === 0) return [{ json: { hasFailures: false, message: '' } }];
const lines = failed.map((g) => '- assignee ' + g.json.assignee_telegram_id + ': ' + g.json.task_ids.length + ' task(s) not delivered');
const message = 'F3: ' + failed.length + ' onboarding notification(s) could not be delivered (assignee unreachable in Telegram). These tasks were NOT marked notified and will retry:\\n' + lines.join('\\n');
return [{ json: { hasFailures: true, message } }];`;

const nodes = [
  { parameters: { rule: { interval: [{ field: 'cronExpression', expression: '0 9 * * *' }] } },
    id: 'Schedule 09:00', name: 'Schedule 09:00', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: [-400, 300],
    notes: 'Office tz comes from workflow Settings -> Timezone (Europe/Istanbul).' },

  airtableSearch('Fetch Employees', 'Employees', '', [-180, 300]),
  airtableSearch('Fetch Pending Tasks', 'Onboarding_Tasks', "AND({Status} = 'Pending', {Notified_At} = BLANK())", [40, 300]),

  codeNode('Build Messages', built('notify'), [260, 300]),

  { ...telegramPost('Send Telegram', 'sendMessage',
      '={{ JSON.stringify({ chat_id: $json.assignee_telegram_id, text: $json.text, reply_markup: $json.reply_markup }) }}', [480, 300]),
    onError: 'continueRegularOutput',
    notes: 'Continue on fail: one bad send must not halt the batch or block write-back for the others.' },

  // success path: match by chat id, write back
  codeNode('Notified Updates', NOTIFIED_UPDATES, [700, 200]),
  { parameters: {
      resource: 'record', operation: 'update', base: BASE, table: table('Onboarding_Tasks'),
      columns: { mappingMode: 'autoMapInputData' }, options: {} },
    id: 'Mark Notified', name: 'Mark Notified', type: 'n8n-nodes-base.airtable', typeVersion: 2.1, position: [920, 200],
    notes: 'Attach Airtable credential after import.' },

  // failure path: report undelivered groups to HR
  codeNode('Failed Sends', FAILED_SENDS, [700, 420]),
  { parameters: {
      conditions: { options: { caseSensitive: true, typeValidation: 'strict' }, combinator: 'and',
        conditions: [{ leftValue: '={{ $json.hasFailures }}', rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }] } },
    id: 'IF Has Failures', name: 'IF Has Failures', type: 'n8n-nodes-base.if', typeVersion: 2, position: [920, 420] },
  telegramPost('Notify HR (failed sends)', 'sendMessage',
    '={{ JSON.stringify({ chat_id: $env.TELEGRAM_HR_CHAT_ID, text: $json.message }) }}', [1140, 420]),
];

const chain = (from, to) => ({ [from]: { main: [[{ node: to, type: 'main', index: 0 }]] } });
const connections = {
  ...chain('Schedule 09:00', 'Fetch Employees'),
  ...chain('Fetch Employees', 'Fetch Pending Tasks'),
  ...chain('Fetch Pending Tasks', 'Build Messages'),
  ...chain('Build Messages', 'Send Telegram'),
  'Send Telegram': { main: [[
    { node: 'Notified Updates', type: 'main', index: 0 },
    { node: 'Failed Sends', type: 'main', index: 0 },
  ]] },
  ...chain('Notified Updates', 'Mark Notified'),
  ...chain('Failed Sends', 'IF Has Failures'),
  'IF Has Failures': { main: [
    [{ node: 'Notify HR (failed sends)', type: 'main', index: 0 }], // true
    [], // false
  ] },
};

const workflow = {
  name: '02 - Notify (F3)',
  nodes, connections, active: false,
  settings: { executionOrder: 'v1', timezone: 'Europe/Istanbul' },
  pinData: {},
  meta: { note: 'Day boundary handled in code (officeToday). Sends matched back by chat id, not position. Undelivered notifications are reported to HR and retried (not marked notified). Set Settings -> Error Workflow too. TELEGRAM_BOT_TOKEN / TELEGRAM_HR_CHAT_ID + Airtable credential required.' },
};

writeFileSync(join(root, 'workflows', '02-notify.json'), `${JSON.stringify(workflow, null, 2)}\n`);
console.log(`built workflows/02-notify.json  (${nodes.length} nodes, ${Object.keys(connections).length} connections)`);
