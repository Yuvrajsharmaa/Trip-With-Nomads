# Repo Guardrails (Read Me First)

## Two-repository workspace

This project is used from a parent workspace that also contains the separate
`trip-with-nomads-crm` repository. The parent folder is shared context, not a
single Git repository. Read [docs/CROSS_REPO_WORKFLOW.md](docs/CROSS_REPO_WORKFLOW.md)
before changing either product, and read the CRM repository's own `AGENTS.md`
before changing CRM files. Never use `git add .` at the parent, never treat the
nested CRM folder as website-owned, and never assume a website merge also merges
CRM. Shared behavior requires a paired branch/PR/checklist in both repositories.

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
- The chat owns worktree setup and cleanup. The user describes the feature; never ask them to create or switch a worktree.
- For new implementation work, create a fresh native Codex managed worktree from the latest `origin/staging` (pass `ref: origin/staging` explicitly), then create a unique `codex/<feature>` branch in that worktree. If setup is asynchronous, wait for it to finish. Do not implement in the primary checkout.
- If the user asks to continue an existing branch or PR, attach and continue its matching worktree instead of creating a competing branch. Never reuse another feature's worktree.
- Before editing, run `node scripts/verify_worktree.mjs start`. It must report an isolated, clean feature worktree at the current `origin/staging` baseline. If it fails, resolve the setup safely before editing.
- During implementation, commit finished, coherent changes. If unfinished work must be paused or handed off, stage only intentional files, create a `wip:` checkpoint commit, then run `node scripts/verify_worktree.mjs handoff`. Never switch or recycle a dirty worktree.
- Open a PR after the feature is complete, relevant checks pass, and the worktree is clean. Push the feature branch (the pre-push hook runs the `push` guard) and target `staging`. Use a clear conventional PR title and describe the change, checks, and any remaining risk. Keep the PR open while checks, required review, or requested changes are pending.
- Merge a PR with **Squash and merge** only after required checks pass, required independent review is approved, review conversations are resolved, and the user has asked to ship/merge (or has already explicitly authorized that merge). Never bypass branch protection or push directly to a protected branch. If GitHub blocks the merge, report the specific requirement and leave the PR intact.
- After a successful merge, fetch and verify the merged change is on `origin/staging`; then archive the clean managed worktree with the native Codex archive action. Squash merge creates a new commit, so the original feature commits and `wip:` checkpoint history are not automatically reachable from `staging`. Keep the remote feature branch as a recovery ref when it contains unique commits or checkpoint history. Delete it only after verifying that any history still needed is preserved by another durable ref or snapshot, or the user explicitly asks to discard it. If a PR is closed without merging, preserve its branch/worktree and any checkpoint; do not treat close as permission to discard work.
- Before any handoff or cleanup, run `node scripts/verify_worktree.mjs handoff`. The pre-push hook applies the equivalent `push` check automatically.
- If a worktree is dirty, do not use `git reset --hard`, `git clean`, or a branch switch to make it reusable. Create a dated recovery snapshot first and classify generated artifacts separately.

## Git terms in this project

- A **worktree** is the separate folder where one chat edits files. Create one for each new feature chat and archive it after a verified merge.
- A **branch** is the named line of commits for that feature. Use one unique `codex/<feature>` branch per chat.
- A **checkpoint commit** (`wip: ...`) saves unfinished work in Git so pausing or handoff does not leave it only in local files.
- A **pull request (PR)** asks for checks and review before the feature enters `staging`. Open it when implementation and checks are ready; it does not itself merge the feature.
- **Squash and merge** combines the reviewed PR into one commit on `staging`. After staging verification, a separate reviewed PR from `staging` to `main` is the production path.
- **Close a PR** without merging only when the user asks to abandon it. Preserve the branch and worktree so the work remains recoverable.
