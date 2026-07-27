# README template

Fill in and move to the repo root as `README.md`. Keep the honesty markers — they are a feature.

---

# Employee Onboarding Automation

Automates employee onboarding from offer acceptance to the end of week one: role-based task
generation, assignment, reminders, escalation and reporting.

**[▶ 2-minute demo](LINK)**

![architecture](docs/architecture.png)

## The problem

Onboarding is a checklist that lives in someone's head. Steps are missed, IT finds out about a
new hire the morning they arrive, and nobody can answer "is everyone starting Monday ready?"
without asking four people.

I ran service-business operations for five years and hired and onboarded staff myself, so this
is the manual process I know best.

## What it does

1. HR submits a form for a new hire.
2. The system expands a **role-based template** into dated tasks — a backend engineer and a
   service technician get genuinely different onboarding.
3. Deadlines are computed relative to the start date and shifted off weekends.
4. Each assignee gets **one grouped Telegram message**, not one per task, and completes tasks
   from inline buttons.
5. Overdue tasks escalate to HR.
6. A dashboard shows who is starting this week, readiness per person, and where things are stuck.

## Stack

Airtable (system of record + business UI) · n8n, self-hosted on a VPS via Docker (orchestration) ·
JavaScript / Node.js (logic) · Telegram Bot API (notifications and actions) · Airtable Interfaces
(dashboard)

## Data model

[Insert the diagram and a short explanation of the five tables.]

Two decisions worth calling out:

**Templates are data, not logic.** HR changes the onboarding process by editing a table, not by
asking an engineer to edit a workflow. That is the difference between an automation that survives
and one that gets abandoned.

**Generated tasks snapshot their title and description.** Editing a template later must not
rewrite the history of onboardings that already happened.

## Engineering notes

- **Idempotency.** Every generated task carries a deterministic `Task_Key`. Re-running expansion
  is a no-op. Webhooks fire twice; systems that assume otherwise corrupt data quietly.
- **No silent failures.** Every workflow has an error branch that notifies a human. An
  automation nobody trusts is worse than a manual process.
- **Logic outside the low-code tool.** Date math and template expansion live in
  `scripts/` as pure, tested functions and are pasted into n8n Code nodes. Testable, reviewable,
  portable if the platform changes.
- **Grouped notifications.** Twelve separate messages get muted. One message per person per day
  gets read.
- **Data minimisation.** Only name, work email, role and Telegram ID are stored. No documents,
  no personal contact details.

## Why Airtable and not Postgres

Postgres would be a cleaner store, and I normally use Supabase for this kind of thing. Airtable
was chosen because the HR team needs to edit templates, run views and read the dashboard without
an engineer. Tradeoff: rate limits (5 req/s, handled with batched writes), no real constraints,
formula-based keys instead of database ones.

## Running it

[Setup steps, `.env.example` vars, import order for the CSVs, workflow import instructions.]

## Status and scope

Built as a portfolio project by one person over two days. It runs, it is deployed, and the demo
video is unedited — but it has not been used by a real HR team, and it is described that way
deliberately.

Not implemented, on purpose: ATS integration, offboarding, e-signature, SSO against a real
identity provider, multi-language.

## What I would do next

[2–3 honest items. E.g. move the store to Postgres with Airtable as a view layer once the
process stabilises; add per-task SLA tracking; a weekly digest to the head of people.]

---

**Ibragim Salimgariev** — automation engineer, Antalya (GMT+3)
ibragim_0202@icloud.com
