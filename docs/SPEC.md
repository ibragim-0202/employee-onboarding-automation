# SPEC — Employee Onboarding Automation

## Scope

Covers the employee lifecycle from **offer accepted** to **end of first week**.
Out of scope: recruiting/ATS, payroll, offboarding. Named as future work in the README.

## Actors

| Actor | Does |
|---|---|
| HR coordinator | Submits the new-hire form; watches the dashboard |
| IT | Receives and completes equipment/account tasks |
| Hiring manager | Receives and completes team/intro tasks |
| New hire | Receives a welcome message with first-day details (optional, stage 2) |

## Core flows

### F1 — Intake
**Trigger:** Airtable form submission (or a record created in `Employees` with status `New`).
**Input:** full name, role, department, start date, manager, manager Telegram ID, email.
**Steps:**
1. Validate: required fields present, start date is in the future, role exists in `Roles`.
   Also: if the role has at least one active template with `Assignee_Role` = `Manager`, then
   `Manager_Telegram_ID` is required — a missing manager id is an incomplete form, caught here,
   not a lookup miss. (F2 keeps a belt-and-suspenders fallback: if it slips through, the manager
   task is created as unresolved.)
2. On invalid input → set employee status `Error`, write reason to `Validation_Notes`, notify HR. Stop.
3. Set status `Onboarding`.
4. Trigger F2.

**Edge cases to handle explicitly:** duplicate submission for the same person (dedupe on
email + start date); start date on a weekend (shift task deadlines, not the start date itself).

### F2 — Task expansion
For the employee's role, read all `Task_Templates` where `Role` matches **or** `Applies_To_All`
is true. For each template create one `Onboarding_Tasks` record:

- `Employee` → link to the employee
- `Title`, `Description`, `Assignee_Role` → copied from the template
- `Due_Date` = start date + `Day_Offset` in **calendar** days (HR edits offsets and thinks
  calendar, e.g. "contract 3 days before start"). If the result lands on a weekend it is nudged
  to a working day, in the direction that keeps the deadline safe:
    - `Day_Offset` > 0 (after start) → shift **forward** to Monday
    - `Day_Offset` < 0 (prep before start) → shift **backward** to Friday, so a prep task never
      slips onto or past the day it was meant to precede
    - `Day_Offset` = 0 (the start day itself) → used as-is, never weekend-adjusted; per F1 the
      start date does not move, only task deadlines do
- `Status` = `Pending`
- `Assignee_Telegram_ID` = resolved from active `Assignees` by role, except `Manager`, which
  resolves to the employee's own `Manager_Telegram_ID`

**Unresolved assignees.** If a role has no active assignee (or the manager id is missing), the
task is still created with `Assignee_Telegram_ID` = "" and `Unresolved_Assignee` = true — never
dropped. The expansion function is pure and sends nothing; it returns `{ tasks, warnings }`,
where each warning is `{ task_key, assignee_role, reason }`.

After creating the tasks, if `warnings` is non-empty, F2 sends the HR coordinator **one** summary
message ("onboarding created, N task(s) have no assignee — check the assignee config"), not one
message per task.

Task expansion must be **idempotent**: re-running it for the same employee must not create
duplicates (dedupe on `Task_Key`). Dedupe is create-only — a re-run creates nothing new and does
**not** rewrite or heal existing tasks. In particular, a re-run does not fix an
`Unresolved_Assignee` task even after the assignee config is corrected. **This is a deliberate
limitation, not an oversight:** create-only keeps the workflow simple and its history stable. To
fix an unresolved assignee, HR either corrects the assignee config *before* the first run, or edits
`Assignee_Telegram_ID` directly on the task in Airtable (the system of record). Auto-healing on
re-run is intentionally out of scope.

### F3 — Notification
**Trigger:** scheduled, daily at 09:00 (office timezone, see Non-functional).
Select tasks where `Status` = `Pending` and `Due_Date` <= today. Group by assignee — one message
per person, not one per task. Message lists the new hire, the tasks and their due dates. Tasks whose
template has `Blocking` = true are flagged in the text (e.g. a ⚠️ / "blocking" marker) so the
assignee sees they must be done before day 1. Each task has two inline buttons: **Done** and
**Not applicable**. Set `Notified_At` so nothing is sent twice.

### F4 — Completion
**Trigger:** Telegram callback from an inline button.
- **Done** button → `Status` = `Done`, `Completed_At` = now, `Completed_By` = Telegram user.
- **Not applicable** button → `Status` = `Skipped`, `Completed_At` = now, `Completed_By` = Telegram user.

Edit the original message to reflect the new state. Reject callbacks from users who are not the
assignee.

After updating the task, check the employee's remaining tasks: if none are still `Pending`
(all are `Done` or `Skipped`), set the employee `Status` = `Complete`.

**Known limitation — callback race.** There is a small window between reading the task and
writing it: two very fast taps can both read `Pending` and both apply. Airtable has no conditional
write / compare-and-set, so this is not fully preventable. It is a **deliberate, documented
limitation, not an oversight** — and it is harmless: the final state is the same `Done`/`Skipped`
either way, `Completed_By` is the same authorised assignee, only `Completed_At` differs by
milliseconds, and re-marking `Complete` is idempotent. Once the first tap commits, the second
callback resolves to *already marked* (see below) and does not rewrite `Completed_At`.

### F5 — Escalation
**Trigger:** scheduled, daily at 18:00 (office timezone, see Non-functional).
Tasks with `Status` = `Pending` and `Due_Date` < today and `Escalated_On` != today → increment
`Escalation_Count`, set `Escalated_On` = today, notify the HR coordinator with a grouped summary.
The `Escalated_On` check guarantees at most once per task per day even if the workflow is re-run.

### F6 — Dashboard
Airtable Interface, three views (build steps in `docs/DASHBOARD.md`):
- **This week** — employees whose `Start_Date` is within the next 7 days, with `Completion_Pct`
  per person. `Completion_Pct` = resolved / all = (`Done` + `Skipped`) / all tasks, so 100%
  coincides with `Status` = `Complete`. (SPEC originally said "Done / all"; that contradicted the
  `Complete` rule, so resolved / all is the deliberate reconciliation.)
- **Blocked** — overdue tasks (`Status` = `Pending`, `Due_Date` < today) grouped by assignee
- **Metrics** —
  - *Average completion time by task type*: mean of `Completion_Days`
    (`Completed_At` − `Created_At`) grouped by the task's snapshotted `Category`.
  - *Percentage of onboardings complete by day 7*: share of employees where `Status` = `Complete`
    and the last task closed within **day 7 = `Start_Date` + 7 calendar days**
    (`DATETIME_DIFF(Last_Completed_At, Start_Date, 'days') <= 7`). Approximate in source — there is
    no stored timestamp for when an employee *became* `Complete`, so the last task's `Completed_At`
    stands in; the day-7 boundary itself is exact and reproducible.

## Non-functional

- Every workflow has an error branch that notifies HR. No silent failures — this is the point
  the README should make loudly.
- Rate limits: Airtable 5 req/s per base; batch writes in groups of 10.
- All timestamps stored in UTC; displayed in the office timezone. Office timezone is
  `Europe/Istanbul`, configured via the `OFFICE_TIMEZONE` env var — never hardcoded. The 09:00
  and 18:00 schedules are interpreted in this timezone.
- No personal data beyond name, role, work email and Telegram ID. Note GDPR-minimisation
  reasoning in the README.

## Definition of done

- [ ] Submitting the form produces a correct, fully-dated task list
- [ ] Assignees receive one grouped Telegram message and can complete tasks from it
- [ ] Overdue tasks escalate to HR
- [ ] Dashboard shows the three views
- [ ] Re-running expansion creates no duplicates
- [ ] Every workflow fails loudly
- [ ] README, architecture diagram, screenshots, 2-minute demo video
