# BUILD_PLAN — two days

Each block ends with something that works. Do not move on with a broken previous block.

---

## Day 1

### Block 1 — Base and data (2h)
- [ ] Create Airtable base `HR Onboarding`, five tables per `docs/SCHEMA.md`
- [ ] Import `data/roles.csv`, `data/assignees.csv`, `data/task_templates.csv` (in that order)
- [ ] Replace the placeholder Telegram IDs in `Assignees` with real ones (use two of your own
      accounts / a test group so the demo works)
- [ ] Link `Task_Templates.Role` to the right `Roles` records after import
- [ ] Create the Airtable form for `Employees` (name, email, role, department, start date,
      manager name, manager Telegram ID)
- [ ] Generate a personal access token, scope it to this base only
- [ ] **Checkpoint:** submit the form by hand → a record appears with status `New`

### Block 2 — Core logic in JavaScript (3h)

Write these in `scripts/` as plain Node modules **first**, with tests, then paste into n8n.
This is the part a technical interviewer will actually read.

- [ ] `scripts/dates.js` — `dueDateFromOffset(startDate, offset)`; returns ISO; calendar-day
      offset nudged off weekends (forward if offset > 0, backward if < 0, no shift if 0);
      handles negative offsets; no external date library
- [ ] `scripts/expandTemplates.js` — pure function:
      `(employee, templates, assignees) => { tasks, warnings }`. Applies role match +
      `Applies_To_All`, resolves assignee (`Manager` → employee's manager), computes `Due_Date`,
      builds `Task_Key`; unresolved assignees produce `Unresolved_Assignee` + a warning
- [ ] `scripts/validate.js` — required fields, start date in the future, role exists; returns
      `{ valid, errors[] }`
- [ ] `scripts/__tests__/` — node:test cases covering: weekend shifting, negative offsets,
      manager resolution, a role with no specific templates, an inactive template
- [ ] **Checkpoint:** `node --test` passes; running expansion on a sample employee prints a
      correct task list

### Block 3 — Intake workflow in n8n (2h)
- [ ] Trigger: Airtable trigger on new `Employees` record (or scheduled poll for status `New`)
- [ ] Code node: validation → on failure, set status `Error` + `Validation_Notes`, Telegram to HR, stop
- [ ] Fetch `Task_Templates` (active) and `Assignees` (active)
- [ ] Code node: `expandTemplates`
- [ ] Fetch existing tasks for this employee, filter out any `Task_Key` that already exists
- [ ] Batch-create `Onboarding_Tasks` (batches of 10)
- [ ] Set employee status `Onboarding`
- [ ] Error branch on the whole workflow → Telegram to HR
- [ ] **Checkpoint:** form submission produces a correct, dated task list; running it twice
      creates nothing the second time

---

## Day 2

### Block 4 — Notification and completion (3h)
- [ ] Scheduled workflow, daily 09:00: tasks where `Status`=`Pending`, `Due_Date` <= today,
      `Notified_At` empty
- [ ] Group by `Assignee_Telegram_ID` — **one message per person**
- [ ] Message: new hire name, start date, task list; one inline button per task with
      `callback_data = task record ID`
- [ ] Write `Notified_At`
- [ ] Second workflow on Telegram callback: verify sender is the assignee → set `Status`=`Done`,
      `Completed_At`, `Completed_By` → edit the original message → answer the callback
- [ ] **Checkpoint:** you receive a grouped message, tap a button, Airtable updates, message
      visibly changes

### Block 5 — Escalation and dashboard (2h)
- [ ] Scheduled workflow, daily 18:00: overdue pending tasks → increment `Escalation_Count`,
      grouped summary to HR, once per task per day
- [ ] `Completion_Pct` rollup on `Employees`
- [ ] Airtable Interface with three views: This week / Blocked / Metrics
- [ ] **Checkpoint:** set a due date to yesterday, run the workflow, HR gets the escalation

### Block 6 — Portfolio artifacts (3h)

This block is not optional. Without it the previous two days are invisible.

- [ ] Export every workflow → `workflows/*.json`, strip credentials
- [ ] `.env.example`
- [ ] Architecture diagram (Excalidraw or Mermaid) → `docs/architecture.png`
- [ ] Screenshots: base schema, a task list, the Telegram message, the dashboard →
      `docs/screenshots/`
- [ ] `README.md` from `docs/README_TEMPLATE.md`
- [ ] Demo video, 2 minutes, no talking head: submit form → tasks appear → Telegram → tap →
      dashboard updates. Upload unlisted, link at the top of the README
- [ ] Push to GitHub, public, meaningful commit history
- [ ] **Checkpoint:** send the repo link to someone who does not know the project and ask if
      they understand what it does in 60 seconds

---

## Deliberately out of scope

Say so in the README rather than half-building it: ATS integration, offboarding, e-signature,
SSO/OAuth against a real IdP, multi-language, role-based access in Airtable beyond the built-in
sharing model.
