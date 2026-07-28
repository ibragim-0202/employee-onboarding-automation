# DASHBOARD — building the Airtable Interface (F6)

The dashboard is built by hand in Airtable Interfaces. This is the exact recipe: the helper
fields it needs, then the three views, then what to screenshot for the README.

Everything here is read-only reporting — no workflow writes to these fields.

---

## Part 1 — helper fields (add these first)

These back the metrics. Field types and formulas match `docs/SCHEMA.md`.

### On `Onboarding_Tasks`

| Field | Type | Configuration |
|---|---|---|
| `Created_At` | Created time | (automatic) — base of the completion-time metric |
| `Resolved` | Formula | `IF(OR({Status} = 'Done', {Status} = 'Skipped'), 1, 0)` |
| `Completion_Days` | Formula | `IF({Completed_At}, DATETIME_DIFF({Completed_At}, {Created_At}, 'days'), BLANK())` |

`Category` is already snapshotted onto the task at creation (by F2), so no extra work — it is a
`Single select` with the same options as the template.

### On `Employees`

| Field | Type | Configuration |
|---|---|---|
| `Completion_Pct` | Rollup | Field: `Tasks` → `Resolved`; aggregation `AVERAGE(values)`; format as **Percent**, 0 decimals |
| `Last_Completed_At` | Rollup | Field: `Tasks` → `Completed_At`; aggregation `MAX(values)` |
| `Complete_By_Day7` | Formula | `IF(AND({Status} = 'Complete', DATETIME_DIFF({Last_Completed_At}, {Start_Date}, 'days') <= 7), 1, 0)` |

`Completion_Pct` = (Done + Skipped) / all, so 100% lines up with `Status` = `Complete`.
`Complete_By_Day7`: **day 7 = `Start_Date` + 7 calendar days**, exact and reproducible.

---

## Part 2 — the three views

Create one Interface (e.g. "HR Onboarding") with three pages.

### View 1 — This week

- **Element:** Grid (or List), source `Employees`.
- **Filter:** `Start_Date` is within the next 7 days —
  `Start_Date` is on or after `today` AND on or before `DATEADD(TODAY(), 7, 'days')`.
- **Sort:** `Start_Date` ascending.
- **Fields shown:** `Full_Name`, `Role_Name`, `Department`, `Start_Date`, `Status`,
  `Completion_Pct` (display as a progress bar).
- **Reads as:** "who is starting soon and how ready is each person."

### View 2 — Blocked

- **Element:** Grid, source `Onboarding_Tasks`.
- **Filter:** `Status` = `Pending` AND `Due_Date` is before `today`.
- **Group by:** `Assignee_Role` (each group = one team's overdue pile).
- **Sort:** `Due_Date` ascending (most overdue first).
- **Fields shown:** `Title`, `Employee`, `Due_Date`, `Escalation_Count`, `Blocking`.
- **Reads as:** "what is overdue and who owns it" — mirrors the F5 escalation, on screen.

### View 3 — Metrics

Two elements on one page:

1. **Average completion time by task type**
   - Chart element, type **Bar**, source `Onboarding_Tasks`.
   - Filter: `Status` = `Done` (only completed tasks have a completion time).
   - X-axis (group by): `Category`.
   - Y-axis (value): `AVERAGE` of `Completion_Days`.

2. **Onboardings complete by day 7**
   - Number element, source `Employees`.
   - Value: `AVERAGE` of `Complete_By_Day7`, formatted as **Percent**.
   - (Average of a 1/0 field = the share that is true.)
   - Optional second Number: `AVERAGE` of `Completion_Pct` across employees starting this month.

---

## Part 3 — screenshots for the README

Capture these into `docs/screenshots/` (referenced from the README and the demo):

- `base-schema.png` — the five tables / relationships (from the data model).
- `task-list.png` — a generated `Onboarding_Tasks` list for one new hire (shows dated, assigned tasks).
- `telegram-message.png` — the grouped Telegram message with the Done / Not applicable buttons.
- `dashboard-thisweek.png` — View 1.
- `dashboard-blocked.png` — View 2.
- `dashboard-metrics.png` — View 3.

For a clean demo, seed one employee starting in 1–2 days (so tasks are due immediately and the
screens are not empty) and one with a couple of overdue tasks (so **Blocked** and the escalation
have something to show).
