# CLAUDE.md — project context

Read this first. Then read `docs/SPEC.md` and `docs/SCHEMA.md`.

## What this is

`onboarding-automation` — an employee onboarding automation system. Someone submits a form for
a new hire; the system creates the employee record, expands a role-based task template into
dated, assigned onboarding tasks, notifies the responsible people in Telegram, tracks completion,
escalates overdue items, and exposes a dashboard.

## Why it exists

Portfolio project, built to be shown to hiring managers for HR-automation / integration
engineering roles. It must therefore be:

1. **Real and running** — deployed, not a mockup. Screenshots and a demo video must show it working.
2. **Readable** — a non-technical HR person and a technical reviewer both look at the repo.
3. **Documented** — `README.md` is the primary artifact. The code supports the README, not the
   other way around.

Author: Ibragim Salimgariev. All repo content in **English**.

## Stack (fixed — do not substitute)

| Layer | Tool | Note |
|---|---|---|
| Database + business UI | Airtable | System of record; HR staff work here directly |
| Orchestration | n8n (self-hosted, Docker, VPS) | All workflows exported to `workflows/*.json` |
| Custom logic | JavaScript (Node.js) | Runs in n8n Code nodes; mirrored in `scripts/` |
| Notifications / actions | Telegram Bot API | Assignees get tasks and mark them done |
| Dashboard | Airtable Interface | Screenshots into `docs/screenshots/` |

Airtable is deliberate: the job ads that this project targets ask for it by name. Do not
replace it with Postgres/Supabase even though that would be technically cleaner. Note the
tradeoff in the README instead — that shows judgement.

## Conventions

- JS: ES modules, `async/await`, no callbacks. Every external call wrapped in try/catch with a
  meaningful error message. Pure functions for date/template logic so they can be unit-tested
  outside n8n.
- Any logic longer than ~10 lines lives in `scripts/` as a standalone tested module and is
  pasted into the n8n Code node — never written only inside n8n.
- Dates: ISO `YYYY-MM-DD` everywhere. Working-day math must skip Sat/Sun.
- Secrets: `.env` only, never committed. `.env.example` lists required vars.
- Commits: conventional-ish (`feat:`, `fix:`, `docs:`), small, in English.

## Rules for the assistant

- Do not invent metrics, client names, or claims of production use anywhere in this repo.
  This is explicitly a self-built portfolio project and is described as such.
- Prefer the simplest thing that works. This is judged on clarity, not cleverness.
- When something in the spec is ambiguous, ask rather than guess.
- Keep the README honest about what is not implemented.

## Current status

Not started. Follow `docs/BUILD_PLAN.md`.
