// n8n Code node — "Build Edit" (F4)  (THIN WRAPPER — do not put logic here)
// Core (notify.js) inlined by `npm run build:nodes`. Paste completeRender.built.js.
//
// Input: the sibling tasks of this message (all tasks sharing Telegram_Message_ID),
// fetched AFTER the update. Ref: "Resolve", "Fetch Employees".
// Output: { editBody, callback_query_id, answerText } — editBody is the JSON body for
// Telegram editMessageText, re-rendering the whole message in its current state.

/* __CORE__ */

const flat = (v) => (Array.isArray(v) ? v[0] : v);
const r = $('Resolve').first().json;

const empById = {};
for (const i of $('Fetch Employees').all()) {
  empById[i.json.id] = { name: i.json.Full_Name, start_date: i.json.Start_Date };
}

const tasks = items.map((i) => {
  const f = i.json;
  const employee_id = flat(f.Employee);
  const e = empById[employee_id] || {};
  return {
    id: f.id, title: f.Title, due_date: f.Due_Date, blocking: f.Blocking === true,
    status: f.Status, employee_id, employee_name: e.name, start_date: e.start_date,
  };
});

const { text, inline_keyboard } = renderMessage(tasks);
const body = { chat_id: r.telegram_chat_id, message_id: Number(r.telegram_message_id), text };
if (inline_keyboard.length) body.reply_markup = { inline_keyboard };

return [{ json: { editBody: JSON.stringify(body), callback_query_id: r.callback_query_id, answerText: r.answerText } }];
