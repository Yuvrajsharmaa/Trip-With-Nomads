# Versioning & Branch Workflow

This repository now uses strict branch governance so Codex and Antigravity can hand off safely without branch sprawl or drift.

## Protected branches
- `main`: production only
- `staging`: staging validation lane
- Both are PR-only, never direct push.

## Active feature branch policy
- One active feature branch at a time.
- Source of truth: `/.branch-policy.json`
- Quarantine branches (`codex/wip-quarantine-*`) are preserved and excluded from cleanup.

### Commands

```bash
npm run branch:activate -- <branch> --owner codex
npm run branch:handoff -- --to antigravity --note "context"
npm run branch:cleanup -- --stale --grace-days 7
npm run branch:cleanup -- --stale --grace-days 7 --apply
```

## Daily workflow
1. `git checkout main`
2. `git pull --ff-only`
3. `git checkout <active-feature-branch>`
4. `git rebase main`
5. `npm run verify`
6. Push feature branch and open PR to `staging`

## Promotion to live
1. PR: feature -> `staging` (squash)
2. Validate staging
3. PR: `staging` -> `main` (squash)
4. Deploy live from `main` only

## Local guardrails
Install once per clone:

```bash
npm run hooks:install
```

Enforced checks:
- `pre-commit`: `repo:guard` + `secret:scan`
- `pre-push`: `repo:guard` + `secret:scan` + `verify`

`verify` currently runs:
- `npm run repo:guard`
- `npm run secret:scan`

## Secret hygiene
- Never commit `.env*` files.
- Never hardcode JWT/API keys.
- Run historical sweep when needed:

```bash
npm run secret:audit-history
```

Report output: `docs/security/secret-audit-report.md`

## Release notes + handoff
- Update `docs/CRM_STATUS.md` and `docs/HANDOFF_CODEX.md` after workflow/security changes.
