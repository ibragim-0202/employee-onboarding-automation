import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectOverdue, daysOverdue, escalationUpdates, buildEscalationSummary } from '../escalate.js';

const TODAY = '2026-08-10';

const task = (over = {}) => ({
  id: 'recT1', title: 'Issue laptop', due_date: '2026-08-05', status: 'Pending',
  escalated_on: '', escalation_count: 0, assignee_role: 'IT',
  employee_id: 'recEMP1', employee_name: 'Jane Doe', ...over,
});

// --- selectOverdue: strict < boundary and once-per-day guard --------------

test('overdue (due strictly before today) is selected', () => {
  assert.equal(selectOverdue([task({ due_date: '2026-08-09' })], TODAY).length, 1);
});

test('due today is NOT overdue (strict <, unlike notifications)', () => {
  assert.equal(selectOverdue([task({ due_date: TODAY })], TODAY).length, 0);
});

test('due in the future is not selected', () => {
  assert.equal(selectOverdue([task({ due_date: '2026-08-11' })], TODAY).length, 0);
});

test('already escalated today is skipped (idempotent re-run)', () => {
  assert.equal(selectOverdue([task({ due_date: '2026-08-01', escalated_on: TODAY })], TODAY).length, 0);
});

test('escalated on a previous day is eligible again', () => {
  assert.equal(selectOverdue([task({ due_date: '2026-08-01', escalated_on: '2026-08-09' })], TODAY).length, 1);
});

test('non-Pending tasks are never escalated', () => {
  assert.equal(selectOverdue([task({ status: 'Done', due_date: '2026-08-01' })], TODAY).length, 0);
  assert.equal(selectOverdue([task({ status: 'Skipped', due_date: '2026-08-01' })], TODAY).length, 0);
});

// --- daysOverdue ----------------------------------------------------------

test('daysOverdue counts whole calendar days', () => {
  assert.equal(daysOverdue('2026-08-05', '2026-08-10'), 5);
  assert.equal(daysOverdue('2026-08-09', '2026-08-10'), 1);
});

// --- escalationUpdates: bump count + stamp date ---------------------------

test('escalationUpdates increments the count and stamps today', () => {
  const updates = escalationUpdates([task({ escalation_count: 2 }), task({ id: 'recT2', escalation_count: undefined })], TODAY);
  assert.deepEqual(updates, [
    { id: 'recT1', Escalation_Count: 3, Escalated_On: TODAY },
    { id: 'recT2', Escalation_Count: 1, Escalated_On: TODAY },
  ]);
});

// --- buildEscalationSummary ----------------------------------------------

test('buildEscalationSummary groups by new hire with days overdue', () => {
  const { text, count } = buildEscalationSummary([
    task({ id: 'a', title: 'Issue laptop', due_date: '2026-08-05', assignee_role: 'IT' }),
    task({ id: 'b', title: 'Sign contract', due_date: '2026-08-08', assignee_role: 'HR' }),
  ], TODAY);
  assert.equal(count, 2);
  assert.match(text, /Overdue onboarding tasks \(2\)/);
  assert.match(text, /Jane Doe/);
  assert.match(text, /Issue laptop — IT, due 2026-08-05 \(5d overdue\)/);
  assert.match(text, /Sign contract — HR, due 2026-08-08 \(2d overdue\)/);
});
