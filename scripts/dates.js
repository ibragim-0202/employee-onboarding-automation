// dates.js — due-date arithmetic for onboarding tasks.
//
// Pure and deterministic: operates only on the ISO string it is given, in UTC.
// No `Date.now()`, no local timezone, no external date library. This is on purpose —
// timezone only matters when comparing against "today" (notification / escalation
// logic), never in the offset arithmetic itself, so this module stays trivially
// testable outside n8n.
//
// dueDateFromOffset(startDate, offset):
//   Day_Offset is CALENDAR days (HR edits it and thinks calendar — "contract 3 days
//   before start"), added to the start date. If the result lands on a weekend it is
//   nudged to a working day, in the direction that keeps the deadline safe:
//     offset > 0  (after start)      -> shift FORWARD to Monday
//     offset < 0  (prep before start) -> shift BACKWARD to Friday, so a prep task
//                                        never slips onto or past the day it precedes
//     offset === 0 (the start day itself) -> returned as-is, never adjusted; per
//                                        SPEC F1 the start date does not move, only
//                                        task deadlines do
//   All I/O is ISO `YYYY-MM-DD`.

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 86_400_000;

/** Parse a strict ISO date to a UTC timestamp, rejecting malformed or impossible dates. */
export function parseISO(isoDate) {
  if (typeof isoDate !== 'string' || !ISO_RE.test(isoDate)) {
    throw new Error(`Invalid ISO date: ${JSON.stringify(isoDate)} (expected "YYYY-MM-DD")`);
  }
  const [y, m, d] = isoDate.split('-').map(Number);
  const ts = Date.UTC(y, m - 1, d);
  const back = new Date(ts);
  // Reject values JS would silently roll over, e.g. 2026-02-31 -> 2026-03-03.
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) {
    throw new Error(`Invalid calendar date: ${isoDate}`);
  }
  return ts;
}

/** Format a UTC timestamp back to ISO `YYYY-MM-DD`. */
function toISO(ts) {
  const dt = new Date(ts);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isWeekendTs(ts) {
  const day = new Date(ts).getUTCDay(); // 0 = Sun … 6 = Sat
  return day === 0 || day === 6;
}

/** True if the ISO date falls on Saturday or Sunday. */
export function isWeekend(isoDate) {
  return isWeekendTs(parseISO(isoDate));
}

/**
 * Compute a task due date from the start date and a calendar-day offset, keeping the
 * result on a working day (see the sign rules in the file header).
 * @param {string} startDate - start date, ISO `YYYY-MM-DD`
 * @param {number} offset    - integer calendar-day offset; negative = before the start date
 * @returns {string} the resulting due date, ISO `YYYY-MM-DD`
 */
export function dueDateFromOffset(startDate, offset) {
  if (!Number.isInteger(offset)) {
    throw new Error(`offset must be an integer, got: ${JSON.stringify(offset)}`);
  }
  let ts = parseISO(startDate) + offset * MS_PER_DAY;
  if (offset === 0) {
    return toISO(ts); // the start day itself — never weekend-adjusted
  }
  const step = offset > 0 ? MS_PER_DAY : -MS_PER_DAY; // forward for after-start, backward for prep
  while (isWeekendTs(ts)) {
    ts += step;
  }
  return toISO(ts);
}
