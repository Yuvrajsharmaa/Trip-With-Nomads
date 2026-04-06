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

## CRM v2 Project Rules

- CRM frontend lives in a **separate repo**: `Yuvrajsharmaa/trip-with-nomads-crm`
- DB migrations for CRM stay in **this repo**: `framer-website/supabase/migrations/`
- Always read `docs/CRM_STATUS.md` before starting CRM work — it tracks build progress
- Always read `docs/CRM_SYSTEM_DESIGN.md` for quick reference on roles, lifecycle, and stack
- Use the `/crm-development` workflow for step-by-step process
- After every CRM change, **update `docs/CRM_STATUS.md`** with task status and change log
- Never modify `public.leads` without checking existing Edge Functions (record-lead, waitlist-popup, ntc-invite)
- CRM uses 6 roles: `admin`, `operations_manager`, `sales_manager`, `sales_agent`, `finance_manager`, `finance_agent`
