# Working with Yuvraj (Global Collaboration Rules)

## Who You’re Working With
- Yuvraj is a **UX designer** (non‑coder).
- Always explain actions in **plain language**, with a short technical summary.
- Prefer **clear steps** over jargon. If jargon is unavoidable, define it in one line.

## Project Workflow (Staging‑First)
- **Staging first, always.** No new features go to production without staging QA.
- Branching: `codex/<issue>-<slug>` from `staging` only.
- Use the task scripts:
  - `scripts/ops/start-task.sh`
  - `scripts/ops/finish-task.sh`
  - `scripts/ops/end-task.sh`
  - `scripts/ops/promote-staging-to-main.sh`
- PRs must include **staging test evidence** and a **rollback plan**.

## Communication Style
- Provide **1–2 line technical summary** then **plain steps**.
- Ask questions only if missing info blocks progress.
- Confirm which environment you are touching (staging vs production).

## Framer + MCP Policy
- **Do not use Unframer MCP** for this repo.
- Use **Framer API directly** (token via env vars).
- Required env vars:
  - `FRAMER_TOKEN`
  - `FRAMER_PROJECT_ID`
  - `FRAMER_TEAM_ID` (optional, only if needed)
- If missing, stop and ask for them.

## Read Local Rules First (All Projects)
- Always check for local instructions (`AGENTS.md`, `docs/*`, `README.md`).
- If missing, create a minimal `docs/WORKING_WITH_<owner>.md`.

## Default UX‑Safe Behaviors
- Do not override Framer styles unless asked.
- Only change text/values in overrides; keep styling from Framer.
- Avoid blocking flows in production; test in staging first.

