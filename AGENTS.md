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
