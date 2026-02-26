# Trip With Nomads – Global Agent Workflow

This repo is staging-first. All work lands in `staging` before `main`.

## Quick Commands
1. `scripts/ops/start-task.sh <issue> <slug>`
2. Work on `codex/<issue>-<slug>`
3. `scripts/ops/finish-task.sh`
4. QA on staging site + staging DB
5. `scripts/ops/promote-staging-to-main.sh`
6. `scripts/ops/end-task.sh`

## Purpose
Keep production stable and make every change auditable, reversible, and tested in staging first.

## Environments
- **Staging**
  - Website: staging domain
  - Database: staging Supabase project
- **Production**
  - Website: tripwithnomads.com
  - Database: production Supabase project

## Task Lifecycle
### Start Task
1. Create a GitHub Issue.
2. `scripts/ops/start-task.sh <issue> <slug>`

### During Task
- Work only on `codex/<issue>-<slug>`.
- Keep scope tight and commits reversible.
- Do not test new features on production.

### Finish Task
1. Run `scripts/ops/finish-task.sh`
2. Open PR to `staging`.
3. QA on staging (site + DB).

### Promote
1. `scripts/ops/promote-staging-to-main.sh`
2. Merge staging → main.
3. Tag release.

### End Task
1. `scripts/ops/end-task.sh`

## Rollback
- Revert the PR on `staging` and re-test.
- If already on `main`, revert the main PR and re-tag.

## Hotfix Protocol
Only use when production is broken:
1. Branch: `codex/<issue>-hotfix-<slug>`
2. PR to `main` with hotfix label.
3. Back-merge to `staging`.

## Never Do
- No direct pushes to `main`.
- No new feature testing on production.
- No mixed-scope commits (one issue per PR).
