# Agent Workflow (Mandatory)

This repo is **staging-first**. Agents must follow the workflow docs and scripts below for every task.

## Source of Truth
- `/Users/yuvrajsharma/Desktop/Trip-With-Nomads/docs/GLOBAL_AGENT_WORKFLOW.md`
- `/Users/yuvrajsharma/Desktop/Trip-With-Nomads/docs/AGENT_SELF_RULES.md`
- `/Users/yuvrajsharma/Desktop/Trip-With-Nomads/docs/WORKING_WITH_YUVRAJ.md`

## Required Task Flow
1. `scripts/ops/start-task.sh <issue> <slug>`
2. Work on a `codex/<issue>-<slug>` branch (from `staging`).
3. `scripts/ops/finish-task.sh` to push + open PR to `staging`.
4. Validate on staging.
5. Promote via `scripts/ops/promote-staging-to-main.sh` only after staging QA.
6. `scripts/ops/end-task.sh` after merge + issue close.

## Hard Rules
- No direct pushes to `main`.
- No production testing for new features.
- Every change must land in `staging` first.
- Use PR template fields and include staging QA evidence.
- **No Unframer MCP** for this repo; use Framer API with env vars.

## Global Policy
- Always read local project rules first.
- If missing, create `docs/WORKING_WITH_<owner>.md` with UX‑friendly guidance.

If you are unsure, stop and ask before proceeding.
