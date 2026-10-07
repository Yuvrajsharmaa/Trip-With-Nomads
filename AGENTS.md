# Repo Guardrails (Read Me First)

## Branching / versioning

- Do **not** push directly to `main` or `staging`.
- Work in a feature branch and open a PR.
- Merge PRs with **Squash and merge** to keep history linear (no merge commits).

## Generated files

- Do not commit Supabase CLI generated metadata in `framer-website/supabase/.temp/`.
- Do not commit local runtime artifacts like `framer-website/.wrangler/` or `framer-website/.tmp/`.

## Before merging

- `git status` must be clean.
- Prefer small PRs with clear titles (use `feat:`, `fix:`, `chore:`, `docs:` prefixes).

## Codex worktree safety

- Treat `/Users/yuvrajsharma/Downloads/Trip-With-Nomads` as an inspection-only primary checkout. Do not edit, switch branches, rebase, merge, reset, or clean it while feature work is active.
- Implement each feature in one fresh native Codex worktree on a unique `codex/<feature>` branch created from `origin/staging` after the staging-baseline reconciliation PR lands.
- Before editing a new worktree, run `node scripts/verify_worktree.mjs start`. It must report an isolated, clean feature worktree at the current staging baseline.
- Never reuse or switch a dirty worktree. If work is unfinished, stage only intentional source files and create a `wip:` checkpoint commit before pausing, rebasing, merging, opening a PR, or releasing the worktree.
- Before handoff or cleanup, run `node scripts/verify_worktree.mjs handoff`. The pre-push hook applies the equivalent `push` check automatically.
- If a worktree is dirty, do not use `git reset --hard`, `git clean`, or a branch switch to make it reusable. Create a dated recovery snapshot first and classify generated artifacts separately.
