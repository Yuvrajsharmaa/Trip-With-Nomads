# Global Agent Workflow (Codex + Antigravity)

## Quick Commands
```bash
# 1) Start task (creates codex/<issue>-<slug> from latest staging)
./scripts/ops/start-task.sh <issue-number> [slug]

# 2) Finish task (commit/push/open PR to staging)
./scripts/ops/finish-task.sh <issue-number> <type> <area> "<summary>"

# 3) End task (after merge)
./scripts/ops/end-task.sh <issue-number>

# 4) Promote staging to production
./scripts/ops/promote-staging-to-main.sh
# after merge:
./scripts/ops/promote-staging-to-main.sh --after-merge
```

## Purpose
This workflow keeps production stable while allowing fast delivery.

- `main` is production baseline only.
- `staging` is integration and pre-prod validation.
- `codex/<issue>-<slug>` is the only allowed feature branch format.

## Environment Matrix
- Staging website + staging DB: all new feature testing.
- Production website + production DB: only changes already validated in staging.

## Task Lifecycle
### 1) Start Task
1. Create/confirm issue in GitHub.
2. Run `start-task.sh`.
3. Script checks issue, syncs from `origin/staging`, creates/switches to `codex/<issue>-<slug>`, and moves Kanban to In Progress.

### 2) During Task
1. Keep commits atomic and reversible.
2. Do not mix unrelated changes.
3. Test in staging context only.
4. Keep rollback notes in PR draft.

### 3) Finish Task
1. Run `finish-task.sh`.
2. Script validates branch naming and issue link, commits, pushes, and opens PR to `staging`.
3. Fill required PR sections: target env, staging QA evidence, rollback plan.

### 4) End Task
1. Merge PR into `staging`.
2. Close linked issue.
3. Run `end-task.sh`.
4. Script verifies merge/issue status/Kanban Done and deletes local feature branch.

## Promotion to Production
1. After staging QA pass, run `promote-staging-to-main.sh`.
2. Merge `staging -> main` PR.
3. Run `promote-staging-to-main.sh --after-merge` to create release tag:
   - `baseline/prod-YYYYMMDD-HHMM`

## Rollback Procedure
1. Identify last good production tag (`baseline/prod-*`).
2. Hotfix revert in new PR to `main`.
3. Back-merge the same fix/revert to `staging` immediately.
4. Re-publish only after verification.

## Hotfix Protocol (Exception Path)
Hotfix PRs to `main` are allowed only when:
1. Label `hotfix-approved` is present.
2. Root cause and rollback are documented in PR.
3. Back-merge PR to `staging` is opened immediately.

## Never Do
- No direct pushes to `main`.
- No testing new features in production first.
- No mixed-scope commits in one PR.
- No skipping rollback plan or QA evidence.

## Codex Config Quick Reference
Paste into `config.toml` (global agent config):

```toml
model = "gpt-5.2-codex"
model_reasoning_effort = "high"

# Trip With Nomads – global collaboration defaults
[collaboration]
# Explain in plain language with a short technical summary
explanation_style = "balanced"

[framer]
# Use Framer API directly; do not use Unframer MCP
use_direct_api = true
require_env = ["FRAMER_TOKEN", "FRAMER_PROJECT_ID"]

[workflow]
# Staging-first for Trip With Nomads
staging_first = true
# Human reference docs (repo source of truth):
# - /Users/yuvrajsharma/Desktop/Trip-With-Nomads/docs/GLOBAL_AGENT_WORKFLOW.md
# - /Users/yuvrajsharma/Desktop/Trip-With-Nomads/docs/WORKING_WITH_YUVRAJ.md
# Required flow:
# 1) start-task.sh -> 2) work in codex/<issue>-<slug> -> 3) finish-task.sh (PR to staging)
# 4) staging QA -> 5) promote-staging-to-main.sh -> 6) end-task.sh
```
