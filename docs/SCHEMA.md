# SCHEMA — Airtable base `HR Onboarding`

Five tables. Relational thinking on a semi-structured platform: templates are data, not
hardcoded logic, so HR can change the onboarding process without touching a workflow.

## 1. `Employees`

| Field | Type | Notes |
|---|---|---|
| `Full_Name` | Single line text | Primary field |
| `Work_Email` | Email | Dedupe key with `Start_Date` |
| `Role` | Link → `Roles` | Drives task expansion |
| `Role_Name` | Lookup (from `Role`) | Role name as plain text, so JS matches roles by name — links return record ids, not names |
| `Department` | Single select | Engineering / Operations / Sales / Support |
| `Start_Date` | Date | ISO |
| `Manager_Name` | Single line text | |
| `Manager_Telegram_ID` | Single line text | Resolves the `Manager` assignee role |
| `Status` | Single select | `New`, `Onboarding`, `Complete`, `Error` |
| `Validation_Notes` | Long text | Filled only on `Error` |
| `Tasks` | Link → `Onboarding_Tasks` | Reverse link |
| `Completion_Pct` | Rollup | Done tasks / all tasks |
| `Created_At` | Created time | |

## 2. `Roles`

| Field | Type | Notes |
|---|---|---|
| `Role_Name` | Single line text | Primary. e.g. `Backend Engineer`, `Service Technician` |
| `Description` | Long text | |
| `Task_Templates` | Link → `Task_Templates` | Reverse link |
| `Active` | Checkbox | Inactive roles are not offered in the form |

## 3. `Task_Templates`

The heart of the system. Editing this table changes the onboarding process.

| Field | Type | Notes |
|---|---|---|
| `Title` | Single line text | Primary. e.g. `Issue laptop` |
| `Description` | Long text | What "done" means |
| `Role` | Link → `Roles` | Empty when `Applies_To_All` is on |
| `Role_Name` | Lookup (from `Role`) | Role name as plain text for JS matching; empty for universal templates |
| `Applies_To_All` | Checkbox | Universal tasks (contract, welcome pack) |
| `Assignee_Role` | Single select | `HR`, `IT`, `Manager`, `Finance` |
| `Day_Offset` | Number | Relative to start date. Negative = before. `-3`, `0`, `+5` |
| `Category` | Single select | `Paperwork`, `Equipment`, `Access`, `Training`, `Social` |
| `Blocking` | Checkbox | Must be done before day 1 |
| `Active` | Checkbox | |

## 4. `Assignees`

| Field | Type | Notes |
|---|---|---|
| `Name` | Single line text | Primary |
| `Assignee_Role` | Single select | Matches `Task_Templates.Assignee_Role` |
| `Telegram_ID` | Single line text | Numeric chat ID |
| `Active` | Checkbox | |

`Manager` is resolved per employee, not from this table.

## 5. `Onboarding_Tasks`

Generated. Nobody edits this by hand.

| Field | Type | Notes |
|---|---|---|
| `Task_Key` | Single line text | Built in JS at creation as `employeeRecordId + "::" + templateId`. Stored as plain text, **not** a formula: keyed on the Airtable record id (not email) so it stays stable even if the employee's email or the template is later edited |
| `Employee` | Link → `Employees` | |
| `Template` | Link → `Task_Templates` | Keeps provenance |
| `Title` | Single line text | Snapshot at creation |
| `Description` | Long text | Snapshot |
| `Assignee_Role` | Single select | Snapshot |
| `Blocking` | Checkbox | Snapshot of the template's `Blocking` at creation — flagged in the notification. Snapshotted, not read live: a task that was blocking for this hire stays blocking even if the template changes later |
| `Assignee_Telegram_ID` | Single line text | Resolved at creation; empty when the role could not be resolved |
| `Unresolved_Assignee` | Checkbox | True when no active assignee was found for the role (or manager missing). Task is still created; F2 sends HR one summary. Fix the assignee config, then re-run F2 |
| `Due_Date` | Date | Working-day adjusted |
| `Status` | Single select | `Pending`, `Done`, `Skipped` (`Skipped` set via the "Not applicable" button) |
| `Notified_At` | Date/time | Prevents duplicate notifications |
| `Telegram_Message_ID` | Single line text | Set by F3. Id of the grouped message this task appears in; also the grouping key F4 uses to re-render the whole message on a button tap |
| `Telegram_Chat_ID` | Single line text | Set by F3. Chat the message was sent to, needed to edit it |
| `Completed_At` | Date/time | |
| `Completed_By` | Single line text | Telegram username |
| `Escalation_Count` | Number | |
| `Escalated_On` | Date | Last day this task was escalated. Escalate only if `Escalated_On` != today — prevents double escalation on a re-run |

**Why snapshot the template fields (title, description, assignee role, blocking) instead of
relying on the link:** changing a template later must not rewrite the history of onboardings that
already happened — including whether a task was blocking for that hire. Live facts that are not
template history (the employee's name and start date) are read from `Employees` when needed, not
snapshotted. Say this in the README — it is the kind of detail that separates someone who has
modelled data from someone who has not.

## Relationships

```
Roles ──< Task_Templates
  │
  └──< Employees ──< Onboarding_Tasks >── Task_Templates
                          │
                     Assignees (by role, resolved at creation)
```

## Seed data

`data/roles.csv`, `data/task_templates.csv`, `data/assignees.csv` — import in that order.
Two roles are provided deliberately: one office/engineering role and one service role, to show
the template system handles genuinely different processes.
