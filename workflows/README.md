# workflows

n8n workflow exports (JSON), credentials stripped.

- `01-intake.json` — scheduled poll of `Status = New` → validation → task expansion
- `02-notify.json` — daily 09:00 grouped notifications
- `03-complete.json` — Telegram callback → task completion
- `04-escalate.json` — daily 18:00 overdue escalation

Import via n8n → Workflows → Import from File, then reconnect credentials.

## `code-nodes/`

Paste-ready contents for the n8n Code nodes. The logic itself lives once in `scripts/`
(tested with `node --test`); these files are assembled from it, never hand-written:

- `*.wrapper.js` — the thin n8n glue only (reads `items` / `$` / `$env`, maps Airtable
  fields to/from the pure functions). Edit these for glue changes.
- `*.built.js` — **generated** by `npm run build:nodes`, which inlines the `scripts/`
  core verbatim into each wrapper's `__CORE__` marker. Do not edit. Paste the whole
  `.built.js` into the matching n8n Code node.

Re-run `npm run build:nodes` after changing anything in `scripts/` or a wrapper.
