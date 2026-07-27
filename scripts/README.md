# scripts

Pure, testable logic. Written and tested here first, then pasted into n8n Code nodes.

- `dates.js` — working-day arithmetic relative to a start date
- `expandTemplates.js` — role-based template expansion into dated, assigned tasks
- `validate.js` — new-hire intake validation
- `__tests__/` — run with `node --test`

Nothing here talks to the network. API calls belong in n8n nodes so failures are visible in the
execution log.
