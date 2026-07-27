// n8n Code node — "Parse Callback" (F4)  (THIN WRAPPER — do not put logic here)
// Core (notify.js) inlined by `npm run build:nodes`. Paste completeParse.built.js.
//
// Input: one item = the Telegram update from the trigger (callback_query).
// Output: { ignore, taskId, action, from_id, from_username, callback_query_id }.
// Strict: a callback that is not done:<recId> / skip:<recId> sets ignore=true (the
// workflow just answers it and stops) — never throws.

/* __CORE__ */

const u = items[0].json;
const cq = u.callback_query || {};
const parsed = parseCallback(cq.data);
return [{ json: {
  ignore: parsed === null,
  taskId: parsed ? parsed.taskId : null,
  action: parsed ? parsed.action : null,
  from_id: cq.from ? cq.from.id : null,
  from_username: cq.from ? cq.from.username : null,
  callback_query_id: cq.id,
} }];
