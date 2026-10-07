# Versioning & Branch Workflow

This repo is set up to prefer a **linear git history** (no merge commits) on protected branches.

## Branches

- `staging`: staging-first integration branch.
- `main`: production branch.

## Day-to-day workflow (recommended)

1. Create a feature branch from `staging`.
2. Open a PR back into `staging` and use **Squash and merge**.
3. After QA on staging, open a PR from `staging` → `main` and use **Squash and merge**.

This keeps protected branches linear and avoids long-running branch drift.

## Local guardrails (recommended)

This repo includes lightweight git hooks in `.githooks/` to:

- block direct pushes to `main` / `staging`
- block committing generated/local artifacts

Enable them once per clone:

```bash
git config core.hooksPath .githooks
```

## Worktree isolation

The primary checkout is not a feature workspace. Each Codex feature chat must use one fresh linked worktree and one unique `codex/<feature>` branch created from `origin/staging`.

Run the guard before starting work:

```bash
node scripts/verify_worktree.mjs start
```

Intentional unfinished work must be recoverable in Git before a chat is paused or its worktree is reused:

```bash
git add <intentional-source-files>
git commit -m "wip: checkpoint <feature>"
node scripts/verify_worktree.mjs handoff
```

The worktree must be clean before rebasing, merging, opening a PR, pushing, or cleanup. The pre-push hook rejects dirty worktrees and pushes from the primary checkout. Never use `git reset --hard` or `git clean` to recycle a dirty worktree; snapshot it first.

## Releases / “what’s in production?”

- Tag production deployments on `main` using a timestamp tag like:
  - `prod-YYYYMMDD-HHMM` (example: `prod-20260319-0130`)
- Keep release notes in `MASTER_HANDOFF.md` and/or the relevant `framer-website/docs/*-change-log.md`.

## Supabase migrations

- Use timestamped migration filenames (already in place).
- Do not commit Supabase CLI generated metadata from `framer-website/supabase/.temp/`.
