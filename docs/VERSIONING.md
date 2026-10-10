# Versioning & Branch Workflow

This repo is set up to prefer a **linear git history** (no merge commits) on protected branches.

When working from the parent Trip With Nomads folder, this repository is only
one half of a two-repository workspace. The CRM has its own remote, protected
branches, worktrees, PRs, and release checks. Follow
[docs/CROSS_REPO_WORKFLOW.md](CROSS_REPO_WORKFLOW.md) for feature classification,
paired changes, and safe handoff. Never assume a website branch or merge carries
CRM work with it.

## Branches

- `staging`: staging-first integration branch.
- `main`: production branch.

## What each Git item does

| Item | What it is for | What the feature chat does |
| --- | --- | --- |
| Primary checkout | Shared project view and inspection | Keeps it read-only for implementation. |
| Native worktree | A separate editable folder for one chat | Creates it from `origin/staging` at task start; archives it after a verified merge. |
| `codex/<feature>` branch | Commits for one feature | Creates a unique branch inside that worktree and checkpoints unfinished work. |
| Pull request (PR) | Checks and review before integration | Opens it against `staging` when work is complete, clean, and checked. A PR is not a merge. |
| `staging` | Integration and staging verification | Receives approved feature PRs by squash merge. |
| `main` | Production branch | Receives a separate reviewed PR from `staging` after staging verification. |

## Day-to-day workflow

The Codex chat owns this lifecycle. The user should only need to describe the feature and say when it is ready to ship; the chat creates and manages the worktree, branch, PR, and post-merge cleanup.

1. For a new feature chat, create a fresh native Codex worktree from the latest `origin/staging` (`ref: origin/staging`) and create a unique `codex/<feature>` branch in it. For an explicit request to continue an existing PR, attach its matching worktree instead.
2. Run `node scripts/verify_worktree.mjs start` before editing. Keep all implementation in that linked worktree.
3. Commit coherent completed changes. Before pausing unfinished work or handing it off, commit intentional files with a `wip:` checkpoint message, then run `node scripts/verify_worktree.mjs handoff`.
4. Once the feature is complete and relevant checks pass, make sure the worktree is clean, push the feature branch, and open a PR targeting `staging`. Include the change summary and checks. Leave it open while CI, required independent review, or requested changes are pending.
5. Squash and merge only after required checks and review pass, conversations are resolved, and the user has authorized shipping/merging. If GitHub requires an independent reviewer, leave the PR open and tell the user exactly what is needed; do not bypass protection.
6. After merge, fetch and verify the change is on `origin/staging`, then archive the clean native worktree. Squash merge creates a new commit and does not preserve the original feature or `wip:` commit history as reachable commits. Keep the remote feature branch as a recovery ref when it contains unique history; delete it only after verifying that any history still needed is preserved by another durable ref or snapshot, or the user explicitly asks to discard it.
7. If the user asks to abandon a PR, close it only after preserving the branch and worktree/checkpoint. Closing a PR does not mean its feature is disposable.

After QA on staging, production still follows a separate PR from `staging` to `main`, with **Squash and merge**. Do not deploy as part of the Git merge workflow unless the user explicitly asks.

This keeps protected branches linear and avoids long-running branch drift.

## Local guardrails (recommended)

This repo includes lightweight git hooks in `.githooks/` to:

- block direct pushes to `main` / `staging`
- block committing generated/local artifacts

Enable them once per clone:

```bash
git config core.hooksPath .githooks
```

## Worktree isolation and guard commands

The primary checkout is not a feature workspace. Each Codex feature chat creates one fresh linked worktree and one unique `codex/<feature>` branch from `origin/staging`; users do not have to set these up manually.

Run the guard before starting work:

```bash
node scripts/verify_worktree.mjs start
```

Intentional unfinished work must be recoverable in Git before a chat is paused or handed off:

```bash
git add <intentional-source-files>
git commit -m "wip: checkpoint <feature>"
node scripts/verify_worktree.mjs handoff
```

The worktree must be clean before opening a PR, pushing, merging, or archiving. The pre-push hook rejects dirty worktrees and pushes from the primary checkout. Never use `git reset --hard` or `git clean` to recycle a dirty worktree; snapshot it first.

## Releases / “what’s in production?”

- Tag production deployments on `main` using a timestamp tag like:
  - `prod-YYYYMMDD-HHMM` (example: `prod-20260319-0130`)
- Keep release notes in `MASTER_HANDOFF.md` and/or the relevant `framer-website/docs/*-change-log.md`.

## Supabase migrations

- Use timestamped migration filenames (already in place).
- Do not commit Supabase CLI generated metadata from `framer-website/supabase/.temp/`.
