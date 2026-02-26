# Agent Self Rules (Non-Negotiable)

These rules apply to both Codex and Antigravity.

1. Always branch from `staging` for feature work.
2. One issue = one branch = one PR.
3. Never ship untested code to production.
4. Every PR must include staging test evidence.
5. Keep commit scope atomic and reversible.
6. Every PR must include a rollback plan.
7. Do not touch stable runtime files for unrelated issues.
8. Do not merge feature branches directly to `main`.
9. If a hotfix is merged to `main`, back-merge to `staging` immediately.
10. If working tree is dirty, do not start a new task without explicit override.
