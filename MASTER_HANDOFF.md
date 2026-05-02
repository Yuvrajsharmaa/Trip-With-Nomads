# Trip-With-Nomads Master Handoff (Canonical)

Last updated: 2026-05-01 (Asia/Kolkata)
Canonical scope: `/Users/yuvrajsharma/Desktop/Trip-With-Nomads`
Source policy: This file is built from current code and recent git state only. Older handoff/status docs are treated as stale.

## 1) Current Reality Snapshot (dated)

- [complete] Root repo branch: `codex/crm-lead-workflow-hardening-website-20260427` at `4b7d592`.
- [complete] Root repo tracking: `origin/codex/crm-lead-workflow-hardening-website-20260427`.
- [in progress] Root worktree is heavily dirty with staged/unstaged changes across guardrails + `framer-website` content.
- [complete] `framer-website` is not an isolated git repo in this checkout; its changes are tracked by the root repo branch above.
- [complete] CRM repo branch: `trip-with-nomads-crm` on `feat/attendance-and-leads-overhaul` at `cdfde93`.
- [in progress] CRM repo has tracked edits in:
  - `src/components/dashboard/leads-table.tsx`
  - `src/lib/actions/leads.ts`
- [uncommitted] CRM repo has untracked runtime backup directories:
  - `.next.bak.1777551309/`
  - `.open-next.bak.1777551309/`

Deployment/runtime state observed from code:

- [complete] CRM code has explicit Vercel-aware runtime routing in:
  - `/Users/yuvrajsharma/Desktop/Trip-With-Nomads/trip-with-nomads-crm/src/lib/supabase/runtime-env.ts`
- [in progress] CRM still contains Cloudflare/OpenNext tooling scripts (`cf:*`, `wrangler`) in `trip-with-nomads-crm/package.json`, so migration cleanup is not fully converged.
- [complete] Framer website runtime still centers on Supabase Edge Functions (`create-booking`, `record-lead`, `handle-payment`, etc.) under `framer-website/supabase/functions`.
- [in progress] Cloudflare checkout gateway exists in code at `framer-website/cloudflare/checkout-gateway/` and parity docs/scripts exist, but this repo state alone does not prove full production cutover for that gateway.

## 2) System Map

Framer Website lane (`/Users/yuvrajsharma/Desktop/Trip-With-Nomads/framer-website`):

- Owns customer-facing checkout/booking/lead capture overrides:
  - `framer/CheckoutPageOverrides.tsx`
  - `framer/BookingOverrides.tsx`
  - `framer/BookingStatusOverride.tsx`
  - `framer/EmailPopupOverride.tsx`
- Owns Supabase Edge Functions for website flows:
  - `supabase/functions/create-booking/index.ts`
  - `supabase/functions/record-lead/index.ts`
  - `supabase/functions/get-booking-status/index.ts`
  - `supabase/functions/handle-payment/index.ts`
  - `supabase/functions/retry-payment/index.ts`
  - `supabase/functions/validate-coupon/index.ts`
- Owns website-side DB migrations/runbooks under `framer-website/supabase/migrations` and `framer-website/supabase/runbooks`.

CRM lane (`/Users/yuvrajsharma/Desktop/Trip-With-Nomads/trip-with-nomads-crm`):

- Owns internal CRM app (Next.js) including auth, roles, dashboards, lead operations, attendance, tasks.
- Reads/writes `crm.*` schema and `public.leads` via server actions.
- Enforces role-based lead visibility in:
  - `src/types/leads.ts`
  - `src/lib/actions/leads.ts`
  - `src/app/dashboard/leads/page.tsx`

Shared Supabase responsibility boundary:

- Website ingestion and lead creation logic originates in Framer website Edge Function `record-lead`.
- CRM UI and operations consume/modify those leads with stricter role ownership rules.
- `framer-website` contains schema sync artifacts for CRM-facing tables; `trip-with-nomads-crm` contains runtime app logic over those tables.

## 3) Recent Changes (Newest-first)

### A) CRM repo (`trip-with-nomads-crm`)

- Commit `cdfde93` (2026-04-30): ignore local scratch/debug scripts.
  - [complete] Hygiene-level update.
- Commit `8dc2754` (2026-04-30): attendance system overhaul + kanban quarantine.
  - [complete] Added auto-break API and close-tab warning flow.
  - [complete] Attendance actions shifted to `crm` schema usage patterns.
  - [complete] Leads table behavior adjusted (kanban quarantine path).
- Commit `47e01e3` (2026-04-30): deployment architecture docs updated to Vercel.
  - [complete] Repo docs updated in CRM lane.
- Commit `db72c2d` (2026-04-30): CRM hardening and Vercel setup.
  - [complete] Supportive migration/hardening changes.

Current uncommitted CRM delta:

- `src/lib/actions/leads.ts`:
  - [uncommitted] Manager-only `deleteLead` and `bulkDeleteLeads` added.
- `src/components/dashboard/leads-table.tsx`:
  - [uncommitted] Manager-visible destructive delete actions (single + bulk) wired into UI.

### B) Root/framer-website lane

Recent root commits on active branch:

- `4b7d592` (2026-04-27): utility Supabase scripts made staging-safe by default.
- `1b919b1` (2026-04-27): full CRM schema synced to staging artifacts in `framer-website/supabase/migrations`.

Current important uncommitted framer-website delta:

- `supabase/functions/record-lead/index.ts`:
  - [uncommitted] Dedupe now skips terminal CRM statuses (`won`, `dropped`, `archived`) before choosing reusable lead identity.
  - [uncommitted] Identity lookup widened and ordered oldest-first to reduce duplicate fragmentation.
  - [uncommitted] Sheets routing now falls back to original/general sheet IDs more defensively.
- `supabase/functions/create-booking/index.ts`:
  - [uncommitted] Booking sheet write gating switched to `BOOKING_SHEETS_WRITE_ENABLED` logic.
- `package.json`:
  - [uncommitted] Added `crm:trips:sync-from-website` script entry.
- New untracked migration/runbook/scripts:
  - [uncommitted] `supabase/migrations/20260429133000_crm_trips_catalog_and_dedupe_canonical.sql`
  - [uncommitted] `supabase/migrations/20260430180000_attendance_schema.sql`
  - [uncommitted] `supabase/runbooks/crm_duplicate_cleanup.sql`
  - [uncommitted] `scripts/sync_crm_trips_catalog_from_website.mjs`
  - [uncommitted] `scripts/import_crm_trips_catalog_from_production.mjs`

## 4) Antigravity / Recent Session Carryover (inferred from code + history)

What is clearly carried over in current codebase:

- [complete] Governance/hygiene stack in root lane exists (branch manager scripts, repo guard, secret scan hooks/workflow files).
- [complete] Checkout gateway/parity scaffolding exists (`framer-website/cloudflare/checkout-gateway/*`, `scripts/push_overrides_safe.mjs`, parity docs).
- [complete] CRM role-scope hardening foundations exist (`AGENT_LEAD_FILTER_TABS`, role-resolved filters, manager checks in server actions).
- [in progress] CRM runtime platform migration is partially converged: Vercel-aware runtime code is present, but legacy Cloudflare/OpenNext scripts are still present.
- [in progress] Lead lifecycle integrity work is still mid-flight across lanes:
  - Website `record-lead` dedupe and sheet routing edits are uncommitted.
  - CRM manager delete actions are uncommitted.

Interpretation for next agent:

- Treat both active repos as continuation states, not merge-ready release states.
- Expect unresolved integration decisions around:
  - final lead dedupe ownership (website ingestion vs CRM consolidation)
  - final platform/tooling cleanup (Vercel-only vs mixed scripts retained)

## 5) Hard Guardrails

Framer lane guardrails:

- Never push override code blind to Framer; use safe push flow from:
  - `/Users/yuvrajsharma/Desktop/Trip-With-Nomads/framer-website/scripts/push_overrides_safe.mjs`
- Keep override-file identity stable (checkout/status/trip price/email overrides are tightly mapped in automation scripts).
- Do not commit Supabase generated temp metadata under `framer-website/supabase/.temp/`.
- Treat migrations as environment-sensitive; stage/production assumptions must be validated before applying any new SQL.

CRM lane guardrails:

- Do not push directly to `main` or `staging`.
- Enforce role ownership server-side, not UI-only; `src/lib/actions/leads.ts` is authoritative for data scope.
- Attendance behavior now has close-tab side effects (`use-warn-on-close` + `/api/attendance/auto-break`); any change here can affect labor-state logs.
- Keep destructive lead operations manager-guarded in both server action and UI layers.

Cross-lane do-not-mix rules:

- Do not bundle `framer-website` checkout/edge-function changes with CRM app UI/attendance changes in a single PR.
- Do not run CRM app migration assumptions directly against website-linked Supabase without explicit project/lane validation.
- Do not treat root branch state as equivalent to CRM repo branch state; they are separate git histories and release paths.
- Never use root stash/cleanup commands without excluding nested repos (`trip-with-nomads-crm`, `internal-crm`) to avoid hiding nested `.git` directories.

## 6) Operational Commands That Matter

Root lane (`/Users/yuvrajsharma/Desktop/Trip-With-Nomads`):

- `npm run verify`
- `npm run hooks:install`
- `npm run branch:activate -- <branch> --owner codex`
- `npm run branch:handoff -- --to <owner> --note "..."`
- `npm run branch:cleanup -- --stale --grace-days 7`

Framer lane (`/Users/yuvrajsharma/Desktop/Trip-With-Nomads/framer-website`):

- `npm run framer:overrides:dry-run`
- `npm run framer:overrides:push`
- `npm run crm:schema:verify`
- `npm run crm:schema:sync-staging`
- `npm run crm:trips:sync-from-website`
- `npm run crm:prod:profiles-only-cleanup`

CRM lane (`/Users/yuvrajsharma/Desktop/Trip-With-Nomads/trip-with-nomads-crm`):

- `npm run verify`
- `npm run test:unit`
- `npm run branch:activate -- <branch> --owner codex`
- `npm run branch:handoff -- --to <owner> --note "..."`
- `npm run branch:cleanup -- --stale --grace-days 7`

## 7) Open Risks / Known Inconsistencies

- [in progress] Platform migration residue in CRM: Vercel-oriented runtime logic coexists with Cloudflare/OpenNext scripts.
- [uncommitted] Lead ingestion/identity dedupe updates in website Edge Function are not committed.
- [uncommitted] Manager lead deletion operations are not committed in CRM branch.
- [in progress] Root repo is highly dirty, increasing accidental-scope risk for any PR.
- [in progress] Untracked migration files exist in `framer-website`; they are easy to miss in partial commits.
- [in progress] Shared-lead ownership is split across website ingestion + CRM workflows; regressions are likely if one side is changed alone.

## 8) Next-Agent Start Checklist

1. Confirm working directory and repo context before any action.
   - Root: `/Users/yuvrajsharma/Desktop/Trip-With-Nomads`
   - CRM: `/Users/yuvrajsharma/Desktop/Trip-With-Nomads/trip-with-nomads-crm`
2. Snapshot branch + dirty state first in both repos.
3. Decide lane for this task before editing:
   - Framer lane only, or CRM lane only.
4. If lane is Framer:
   - Review uncommitted diffs in `record-lead`, `create-booking`, and new migrations/scripts.
   - Dry-run override push command before any live override update.
5. If lane is CRM:
   - Review uncommitted lead delete diffs and confirm role guard expectations.
   - Validate attendance side-effect behavior before touching `useWarnOnClose` or auto-break route.
6. Keep commits narrow and lane-specific.
7. Run lane-appropriate verification commands before pushing.
8. Use PR-only flow into `staging`/`main`, squash merge only.

## Evidence Pointers (for quick navigation)

- Root branch state and commit line:
  - `git status --short --branch` (root)
  - `git log --oneline -n 8` (root)
- Framer website hot files:
  - `/Users/yuvrajsharma/Desktop/Trip-With-Nomads/framer-website/supabase/functions/record-lead/index.ts`
  - `/Users/yuvrajsharma/Desktop/Trip-With-Nomads/framer-website/supabase/functions/create-booking/index.ts`
  - `/Users/yuvrajsharma/Desktop/Trip-With-Nomads/framer-website/scripts/push_overrides_safe.mjs`
  - `/Users/yuvrajsharma/Desktop/Trip-With-Nomads/framer-website/cloudflare/checkout-gateway/src/index.ts`
- CRM hot files:
  - `/Users/yuvrajsharma/Desktop/Trip-With-Nomads/trip-with-nomads-crm/src/lib/actions/leads.ts`
  - `/Users/yuvrajsharma/Desktop/Trip-With-Nomads/trip-with-nomads-crm/src/components/dashboard/leads-table.tsx`
  - `/Users/yuvrajsharma/Desktop/Trip-With-Nomads/trip-with-nomads-crm/src/lib/actions/attendance.ts`
  - `/Users/yuvrajsharma/Desktop/Trip-With-Nomads/trip-with-nomads-crm/src/hooks/use-warn-on-close.ts`
  - `/Users/yuvrajsharma/Desktop/Trip-With-Nomads/trip-with-nomads-crm/src/lib/supabase/runtime-env.ts`
