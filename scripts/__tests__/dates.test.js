import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dueDateFromOffset, isWeekend } from '../dates.js';

// Reference week (verified weekdays):
//   Fri 2026-01-02, Sat 2026-01-03, Sun 2026-01-04,
//   Mon 2026-01-05, Tue 06, Wed 07, Thu 08, Fri 09, Sat 10, Sun 11, Mon 12.

test('adds calendar days when the result is a weekday', () => {
  assert.equal(dueDateFromOffset('2026-01-05', 1), '2026-01-06'); // Mon -> Tue
  assert.equal(dueDateFromOffset('2026-01-05', -3), '2026-01-02'); // Mon -3 = Fri, weekday
});

test('positive offset on a weekend shifts FORWARD to Monday', () => {
  assert.equal(dueDateFromOffset('2026-01-09', 1), '2026-01-12'); // Fri +1 = Sat -> Mon
  assert.equal(dueDateFromOffset('2026-01-09', 2), '2026-01-12'); // Fri +2 = Sun -> Mon
});

test('negative offset on a weekend shifts BACKWARD to Friday', () => {
  assert.equal(dueDateFromOffset('2026-01-05', -1), '2026-01-02'); // Mon -1 = Sun -> Fri
  assert.equal(dueDateFromOffset('2026-01-05', -2), '2026-01-02'); // Mon -2 = Sat -> Fri
});

test('offset 0 is the start day itself and is never weekend-adjusted', () => {
  assert.equal(dueDateFromOffset('2026-01-05', 0), '2026-01-05'); // Mon start
  assert.equal(dueDateFromOffset('2026-01-10', 0), '2026-01-10'); // Sat start -> Sat as-is
  assert.equal(dueDateFromOffset('2026-01-11', 0), '2026-01-11'); // Sun start -> Sun as-is
});

test('offsets are CALENDAR days, not business days (documents the semantics)', () => {
  // Wed +5 calendar = Mon 12. A business-day count would give Wed 14 instead.
  assert.equal(dueDateFromOffset('2026-01-07', 5), '2026-01-12');
  // Mon +10 calendar = Thu 15. A business-day count would give Mon 19 instead.
  assert.equal(dueDateFromOffset('2026-01-05', 10), '2026-01-15');
});

test('crosses month and year boundaries in both directions', () => {
  assert.equal(dueDateFromOffset('2026-12-31', 1), '2027-01-01'); // Thu -> Fri
  assert.equal(dueDateFromOffset('2026-02-27', 1), '2026-03-02'); // Fri +1 = Sat -> fwd Mon
  assert.equal(dueDateFromOffset('2026-03-02', -1), '2026-02-27'); // Mon -1 = Sun -> back Fri
});

test('isWeekend flags Saturday and Sunday only', () => {
  assert.equal(isWeekend('2026-01-10'), true);  // Sat
  assert.equal(isWeekend('2026-01-11'), true);  // Sun
  assert.equal(isWeekend('2026-01-09'), false); // Fri
  assert.equal(isWeekend('2026-01-05'), false); // Mon
});

test('rejects malformed, impossible, or non-string dates', () => {
  assert.throws(() => dueDateFromOffset('not-a-date', 1), /Invalid ISO date/);
  assert.throws(() => dueDateFromOffset('2026-13-01', 1), /Invalid calendar date/);
  assert.throws(() => dueDateFromOffset('2026-02-31', 1), /Invalid calendar date/);
  assert.throws(() => dueDateFromOffset('2026-1-5', 1), /Invalid ISO date/);
  assert.throws(() => dueDateFromOffset(20260105, 1), /Invalid ISO date/);
});

test('rejects a non-integer offset', () => {
  assert.throws(() => dueDateFromOffset('2026-01-05', 1.5), /offset must be an integer/);
  assert.throws(() => dueDateFromOffset('2026-01-05', '1'), /offset must be an integer/);
});
