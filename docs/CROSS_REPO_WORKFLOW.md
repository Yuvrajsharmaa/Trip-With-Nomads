# Two-Repository Agent Workflow Contract

**Contract version:** 1

This workspace contains two related products with separate Git histories. The
parent folder is useful shared context, but it is not a single repository.
Every agent thread working on either product must follow this contract and the
`AGENTS.md` file in the repository it edits.

## Repository map

| Product | Repository | GitHub remote | Production path |
| --- | --- | --- | --- |
| Public website, Framer code, Supabase functions and migrations | `Trip-With-Nomads` | `Yuvrajsharmaa/Trip-With-Nomads` | `staging` -> `main` |
| Internal CRM | `trip-with-nomads-crm` | `Yuvrajsharmaa/trip-with-nomads-crm` | `staging` -> `main` |

When the repositories are checked out together, the CRM appears at
`Trip-With-Nomads/trip-with-nomads-crm/`. It is ignored by the website Git
repository and must never be included in a website commit. The two remotes,
branches, PRs, CI checks, deployments, and worktrees remain independent.

## Parent directory versus editable worktrees

- Treat `/Users/yuvrajsharma/Downloads/Trip-With-Nomads` as a context and
  inspection checkout. Do not edit it, switch branches, rebase, merge, reset,
  clean, or use `git add .` there while feature work is active.
- A website change belongs in a fresh managed worktree created from the latest
  `origin/staging` of the website repository.
- A CRM change belongs in a separate Git worktree created from the latest
  `origin/staging` of the CRM repository.
- Never use a website worktree to edit CRM files or a CRM worktree to edit
  website files. Never copy uncommitted files, `.env` files, generated output,
  or `node_modules` from a dirty checkout into a feature worktree.
- If a checkout is dirty, preserve it and report it. Do not make it reusable by
  running `git reset --hard`, `git clean`, a branch switch, or an untracked
  stash. A recovery snapshot or `wip:` checkpoint must be created before any
  cleanup that could make work unreachable.

## Start-of-thread preflight

Before reading or changing source, identify both repository roots when the
parent workspace is available:

```bash
git -C /path/to/Trip-With-Nomads rev-parse --show-toplevel
git -C /path/to/Trip-With-Nomads remote get-url origin
git -C /path/to/Trip-With-Nomads branch --show-current
git -C /path/to/Trip-With-Nomads status --short --branch

git -C /path/to/Trip-With-Nomads/trip-with-nomads-crm rev-parse --show-toplevel
git -C /path/to/Trip-With-Nomads/trip-with-nomads-crm remote get-url origin
git -C /path/to/Trip-With-Nomads/trip-with-nomads-crm branch --show-current
git -C /path/to/Trip-With-Nomads/trip-with-nomads-crm status --short --branch
```

Fetch remote refs before comparing branches, but remember that fetching changes
only local Git metadata, not source files:

```bash
git -C <repo> fetch origin --prune
git -C <repo> log --oneline --decorate --graph --all -n 30
git -C <repo> worktree list
```

If the current checkout is not the expected repository or its `origin` does
not match the map above, stop and correct the worktree selection before
editing.

## Classify the feature before branching

Every change gets one feature ID and one scope:

- **Website-only:** Framer overrides, public UI, website tests, Supabase
  functions/migrations owned by this repository, or public deployment config.
- **CRM-only:** dashboard UI, CRM actions, CRM auth, CRM tests, or CRM deploy
  configuration.
- **Shared contract:** a database schema, lead/booking/payment payload, auth
  contract, email contract, environment variable, or data meaning consumed by
  both products.

Do not mix unrelated features in one branch or commit. If a change is shared,
use the same feature ID with one branch per repository, for example:

```text
codex/lead-routing-hardening-website
codex/lead-routing-hardening-crm
```

Link the two PRs to each other and list the required deployment order. A shared
feature is not complete when only one repository has been merged.

Before creating a branch, inspect local and remote branches and the repository's
branch policy. If a matching branch or PR exists, attach and continue its
worktree; do not create a competing branch. If another feature is active in the
CRM repository, respect its one-active-feature policy and preserve its work.

## Branch and commit rules

- `main` and `staging` are protected integration lanes. Never push directly to
  either one. Changes enter through a PR and **Squash and merge**.
- Use one isolated `codex/<feature>` branch per repository and per feature
  worktree. Branch names may carry the same feature ID across the two remotes,
  but they are still separate branches.
- Commit one coherent feature at a time. Do not combine unrelated fixes,
  formatting churn, generated output, secrets, or another agent's changes.
- Before each commit, inspect `git status`, `git diff --stat`, and
  `git diff --check`; stage explicit paths only. Never use `git add .` from the
  shared parent.
- A completed commit uses a conventional subject such as `feat:`, `fix:`,
  `chore:`, or `docs:`. If work must pause, create a clearly scoped `wip:`
  checkpoint containing only intentional files, then run the repository's
  handoff guard.
- A feature branch must be clean before a PR is opened, pushed, merged, or its
  worktree is archived. Local generated files are classified and removed only
  by the repository's approved cleanup command; source changes are never
  discarded to make a guard pass.

## Verification and pull requests

Run the repository-specific guard and tests before opening a PR:

- Website: `node scripts/verify_worktree.mjs start` and the documented website
  test suite.
- CRM: `npm run verify`, which includes repository guard, secret scan, lint,
  typecheck, unit tests, and build. Use non-secret lane-specific build
  variables when the build requires them; never invent or commit credentials.

Open one PR per repository, targeting that repository's `staging`. A shared PR
description must include:

1. feature ID and scope;
2. the paired PR URL, if any;
3. migrations/API compatibility and deployment order;
4. exact checks run and any environment-only limitation;
5. rollback or recovery references.

Do not merge until checks pass, review is complete, and the user has authorized
shipping. After staging verification, promote `staging` to `main` through a
separate reviewed PR in each affected repository. Never assume that merging the
website PR also merges the CRM PR.

## Handoff, recovery, and cleanup

At the end of a thread, report both repositories when they are in scope:

- current branch and commit;
- clean, dirty, or deliberately checkpointed status;
- PR and CI status;
- files intentionally changed;
- files explicitly left untouched;
- whether the feature is website-only, CRM-only, or waiting for its paired PR.

Never delete a branch or archive a worktree merely because a PR was closed. A
closed unmerged PR keeps its branch, worktree, and recovery checkpoint until the
user explicitly abandons it or the needed history is preserved elsewhere. After
a successful squash merge, verify the merged commit on remote `staging`, keep a
remote recovery ref when the feature branch has unique history, and archive only
the clean managed worktree.

## Release rule for shared behavior

For changes that affect both products or their shared Supabase data:

1. make migrations and readers backward-compatible;
2. test each repository independently and then test the integration in staging;
3. merge the paired feature PRs to their staging lanes in the documented order;
4. verify the deployed website, Supabase functions, CRM, Sheets, emails, and
   other external integrations;
5. promote both staging lanes to production through reviewed PRs;
6. record the final source hashes and environment target for both repositories.

If any paired check fails, stop promotion and leave both PRs/worktrees
recoverable. Do not claim that a shared feature shipped based on one repository
alone.
