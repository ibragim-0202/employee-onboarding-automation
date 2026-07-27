import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  officeToday, selectDueTasks, groupByAssignee, renderMessage,
  parseCallback, resolveCallback, isEmployeeComplete,
} from '../notify.js';

const TZ = 'Europe/Istanbul'; // fixed UTC+3, no DST

const task = (over = {}) => ({
  id: 'recTASK1', title: 'Issue laptop', due_date: '2026-08-03', blocking: false,
  assignee_telegram_id: '222', status: 'Pending', notified_at: '',
  employee_id: 'recEMP1', employee_name: 'Jane Doe', start_date: '2026-08-03', ...over,
});

// --- officeToday: the day boundary is office-local, not UTC ------------------

test('officeToday is the same for two moments within one office day', () => {
  const a = officeToday(new Date('2026-08-03T06:00:00Z'), TZ); // 09:00 Istanbul
  const b = officeToday(new Date('2026-08-03T20:30:00Z'), TZ); // 23:30 Istanbul
  assert.equal(a, '2026-08-03');
  assert.equal(b, '2026-08-03');
});

test('officeToday uses the office timezone, not UTC (post-midnight case)', () => {
  // 21:30Z is Aug 2 in UTC but 00:30 Aug 3 in Istanbul -> today must be Aug 3.
  assert.equal(officeToday(new Date('2026-08-02T21:30:00Z'), TZ), '2026-08-03');
  // For contrast, the same instant in UTC would be the day before.
  assert.equal(officeToday(new Date('2026-08-02T21:30:00Z'), 'UTC'), '2026-08-02');
});

// --- selectDueTasks: the <= boundary and no double-send ----------------------

test('due today is included (boundary, <=)', () => {
  assert.equal(selectDueTasks([task({ due_date: '2026-08-03' })], '2026-08-03').length, 1);
});

test('due tomorrow is excluded', () => {
  assert.equal(selectDueTasks([task({ due_date: '2026-08-04' })], '2026-08-03').length, 0);
});

test('a task due yesterday stays selected across midnight (same result either side)', () => {
  const t = [task({ due_date: '2026-08-03' })];
  // Runs on Aug 3 (due == today) and on Aug 4 (due < today) both select it: comparison
  // is by date with <=, so crossing midnight does not drop an overdue task.
  assert.equal(selectDueTasks(t, '2026-08-03').length, 1);
  assert.equal(selectDueTasks(t, '2026-08-04').length, 1);
});

test('already-notified tasks are not selected again (no double-send)', () => {
  assert.equal(selectDueTasks([task({ notified_at: '2026-08-03T06:00:00Z' })], '2026-08-03').length, 0);
});

test('non-Pending tasks are never selected', () => {
  assert.equal(selectDueTasks([task({ status: 'Done' })], '2026-08-03').length, 0);
  assert.equal(selectDueTasks([task({ status: 'Skipped' })], '2026-08-03').length, 0);
});

// --- grouping: one message per person ---------------------------------------

test('groupByAssignee makes one group per person, preserving order', () => {
  const groups = groupByAssignee([
    task({ id: 'a', assignee_telegram_id: '222' }),
    task({ id: 'b', assignee_telegram_id: '111' }),
    task({ id: 'c', assignee_telegram_id: '222' }),
  ]);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map((g) => g.assignee_telegram_id), ['222', '111']);
  assert.deepEqual(groups[0].tasks.map((t) => t.id), ['a', 'c']);
});

// --- renderMessage: flags, buttons, re-render --------------------------------

test('renderMessage flags blocking tasks and emits done/skip buttons for Pending', () => {
  const { text, inline_keyboard } = renderMessage([
    task({ id: 'recX', title: 'Issue laptop', blocking: true }),
  ]);
  assert.match(text, /⚠️ Issue laptop \(due 2026-08-03\)/);
  assert.deepEqual(inline_keyboard, [[
    { text: '✅ Done', callback_data: 'done:recX' },
    { text: '🚫 Not applicable', callback_data: 'skip:recX' },
  ]]);
});

test('renderMessage marks final tasks and drops their buttons (re-render)', () => {
  const { text, inline_keyboard } = renderMessage([
    task({ id: 'recDone', title: 'Sign contract', status: 'Done' }),
    task({ id: 'recSkip', title: 'Payroll', status: 'Skipped' }),
    task({ id: 'recPend', title: 'Grant access', status: 'Pending' }),
  ]);
  assert.match(text, /\[done\] Sign contract/);
  assert.match(text, /\[n\/a\] Payroll/);
  assert.equal(inline_keyboard.length, 1); // only the Pending task keeps buttons
  assert.equal(inline_keyboard[0][0].callback_data, 'done:recPend');
});

// --- parseCallback: strict ---------------------------------------------------

test('parseCallback accepts only done/skip with a rec id', () => {
  assert.deepEqual(parseCallback('done:recABC123'), { action: 'done', taskId: 'recABC123' });
  assert.deepEqual(parseCallback('skip:recABC123'), { action: 'skip', taskId: 'recABC123' });
});

test('parseCallback returns null for anything malformed (never throws)', () => {
  for (const bad of ['', 'done:', 'done:xyz', 'delete:recABC', 'recABC', 'done recABC', null, undefined, 42, 'done:rec ABC']) {
    assert.equal(parseCallback(bad), null);
  }
});

// --- resolveCallback: authorization + idempotency ----------------------------

test('resolveCallback rejects a non-assignee', () => {
  assert.deepEqual(
    resolveCallback({ task: task({ assignee_telegram_id: '222' }), fromTelegramId: '999', action: 'done' }),
    { outcome: 'unauthorized' },
  );
});

test('resolveCallback is idempotent on an already-final task', () => {
  assert.deepEqual(
    resolveCallback({ task: task({ status: 'Done' }), fromTelegramId: '222', action: 'done' }),
    { outcome: 'already-final' },
  );
});

test('resolveCallback applies done/skip for the assignee on a Pending task', () => {
  assert.deepEqual(
    resolveCallback({ task: task(), fromTelegramId: '222', action: 'done' }),
    { outcome: 'apply', status: 'Done' },
  );
  assert.deepEqual(
    resolveCallback({ task: task(), fromTelegramId: 222, action: 'skip' }), // numeric id also matches
    { outcome: 'apply', status: 'Skipped' },
  );
});

// --- isEmployeeComplete ------------------------------------------------------

test('isEmployeeComplete is true only when nothing is Pending', () => {
  assert.equal(isEmployeeComplete([task({ status: 'Done' }), task({ status: 'Skipped' })]), true);
  assert.equal(isEmployeeComplete([task({ status: 'Done' }), task({ status: 'Pending' })]), false);
  assert.equal(isEmployeeComplete([]), false);
});
