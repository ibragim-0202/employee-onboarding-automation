# GIT_PLAN — commit sequence

One repo, public, real name. Commit as you finish each block of `docs/BUILD_PLAN.md`, not all
at the end. Result: a believable build history, no fake activity.

## One-time setup

```bash
# in the project folder
git init
git branch -M main

# identity (use the same email as your GitHub account)
git config user.name "Ibragim Salimgariev"
git config user.email "your_github_email@example.com"

# make sure secrets never get committed
cat .gitignore   # should already list .env, node_modules, *.log
```

Create an empty repo on GitHub (no README, no .gitignore — you already have them), named
e.g. `employee-onboarding-automation`. Then:

```bash
git remote add origin git@github.com:USERNAME/employee-onboarding-automation.git
```

## First commit — scaffolding only

Commit the docs and structure before any code. This is a real, honest starting point.

```bash
git add CLAUDE.md docs/ data/ scripts/README.md workflows/README.md .gitignore .env.example
git commit -m "docs: project spec, schema, seed data and build plan"
git push -u origin main
```

## Then, one commit per build block

### Day 1

```bash
# Block 2 — logic + tests (this is the commit reviewers care about most)
git add scripts/dates.js scripts/expandTemplates.js scripts/validate.js scripts/__tests__/
git commit -m "feat: working-day dates, template expansion and validation with tests"

# Block 3 — intake workflow
git add workflows/01-intake.json
git commit -m "feat: intake workflow — validate, expand templates, idempotent task creation"
```

### Day 2

```bash
# Block 4 — notify + complete
git add workflows/02-notify.json workflows/03-complete.json
git commit -m "feat: grouped Telegram notifications and inline task completion"

# Block 5 — escalation + dashboard
git add workflows/04-escalate.json docs/screenshots/dashboard.png
git commit -m "feat: overdue escalation to HR and Airtable dashboard views"

# Block 6a — diagram + screenshots
git add docs/architecture.png docs/screenshots/
git commit -m "docs: architecture diagram and screenshots"

# Block 6b — the README (do this as its own commit, it's the main artifact)
git add README.md
git commit -m "docs: write README with data-model rationale and engineering notes"

git push
```

## Rules

- **Never** `git add .` blindly. Add named files. One stray `.env` in history and the token is
  burned — you would have to rotate it and rewrite history.
- Commit messages in English, present tense, describe the change not the file
  (`feat: grouped notifications`, not `added notify.json`).
- If you finish in one sitting anyway, still make these as separate commits in order. Separate
  logical commits are honest — you did do these as separate steps. Backdating or padding is not;
  don't.
- Before the final push, sanity-check nothing secret leaked:

```bash
git log --all --full-history -- .env        # should return nothing
git grep -i "pat_" $(git rev-list --all)     # should return nothing real
```

## After push

- Repo → About → add a one-line description and the demo-video link
- Pin the repo on your GitHub profile
- Put the repo URL in the CV header and in the cover letter
