// n8n Code node — "Resolve" (F4)  (THIN WRAPPER — do not put logic here)
// Core (notify.js) inlined by `npm run build:nodes`. Paste completeResolve.built.js.
//
// Input: the fetched Onboarding_Tasks record. Ref: "Parse Callback".
// Output: outcome (unauthorized | already-final | apply) + everything the downstream
// branches need (status, ids, message id/chat for the edit, answer text).

/* __CORE__ */

const flat = (v) => (Array.isArray(v) ? v[0] : v);
const p = $('Parse Callback').first().json;
const f = items[0].json;

const task = {
  id: f.id,
  assignee_telegram_id: f.Assignee_Telegram_ID,
  status: f.Status,
  employee_id: flat(f.Employee),
};
const r = resolveCallback({ task, fromTelegramId: p.from_id, action: p.action });

const answerText =
  r.outcome === 'unauthorized' ? 'This task is not assigned to you'
  : r.outcome === 'already-final' ? 'Already marked'
  : (r.status === 'Done' ? 'Marked done' : 'Marked not applicable');

return [{ json: {
  outcome: r.outcome,
  status: r.status || null,
  task_id: f.id,
  employee_id: task.employee_id,
  completed_by: p.from_username || String(p.from_id),
  telegram_message_id: f.Telegram_Message_ID,
  telegram_chat_id: f.Telegram_Chat_ID,
  callback_query_id: p.callback_query_id,
  answerText,
} }];
