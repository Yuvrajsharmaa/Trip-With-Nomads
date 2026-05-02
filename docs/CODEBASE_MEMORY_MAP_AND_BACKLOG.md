# Codebase Memory Map and Hardening Backlog

Last updated: 2026-05-01  
Scope: `Trip-With-Nomads` root, `framer-website`, and `trip-with-nomads-crm`

## 1) Canonical Mental Model

### 1.1 Framer Website Lane

Primary runtime paths:
- Framer override UI runtime: `framer-website/framer/*`
- Website backend logic: `framer-website/supabase/functions/*`
- Browser-facing checkout boundary: `framer-website/cloudflare/checkout-gateway/src/index.ts`
- Data + policy evolution: `framer-website/supabase/migrations/*`

Core flow:
1. Checkout override gathers trip/variant state and invokes checkout APIs.
2. Gateway routes `/api/checkout/*` to Supabase functions/REST.
3. Edge functions process booking, payment callback, retry, status read, and coupon validation.
4. Lead capture flows from popup/override into `record-lead`, then DB + optional Sheets.

### 1.2 CRM Lane

Primary runtime paths:
- App runtime + routes: `trip-with-nomads-crm/src/app/*`
- RBAC and auth context: `trip-with-nomads-crm/src/lib/auth/*`, `src/types/roles.ts`
- Lead lifecycle server actions: `trip-with-nomads-crm/src/lib/actions/leads.ts`, `src/lib/actions/crm-core.ts`
- Attendance lifecycle: `trip-with-nomads-crm/src/lib/actions/attendance.ts`, `src/app/api/attendance/auto-break/route.ts`
- Supabase runtime/env binding: `trip-with-nomads-crm/src/lib/supabase/*`

Core flow:
1. Middleware refreshes session and route-gates by profile status.
2. Server actions resolve user/profile and enforce role gates.
3. Lead list/mutation and attendance mutation actions write to `public.leads` and `crm.*` tables.
4. Side effects (notifications/activity logs/revalidatePath) are triggered post-write.

### 1.3 Root Ops/Governance Lane

Primary control points:
- Branch policy: `.branch-policy.json`
- Local hooks: `.githooks/pre-commit`, `.githooks/pre-push`
- Guard/scan scripts: `scripts/repo-guard.mjs`, `scripts/secret-scan.mjs`, `scripts/branch-manager.mjs`
- CI checks: `.github/workflows/repo-verify.yml`, `.github/workflows/enforce-main-policy.yml`

Core flow:
1. Local hooks enforce branch/secret/repo hygiene pre-commit and pre-push.
2. CI enforces repository verify and main-policy constraints.
3. Branch lifecycle scripts govern activate/handoff/cleanup operations.

---

## 2) Severity-Ranked Weaknesses (Cross-Lane)

## Must-Fix Now

1. Missing server-side ownership checks on several CRM lead mutation actions (`trip-with-nomads-crm/src/lib/actions/leads.ts`).
2. Retry payment authorization relies on booking id + email only (`framer-website/supabase/functions/retry-payment/index.ts`).
3. Booking/status token implementation uses custom signing and secret fallback model (`framer-website/supabase/functions/_shared/booking_status_token.ts`).
4. Wildcard CORS on write-sensitive website functions (`framer-website/supabase/functions/create-booking/index.ts`, `record-lead/index.ts`, `retry-payment/index.ts`, `validate-coupon/index.ts`).
5. Open redirect edge case in CRM auth callback/confirm next-path handling (`trip-with-nomads-crm/src/app/auth/callback/route.ts`, `src/app/auth/confirm/route.ts`).

## Should-Fix Soon

1. Cloudflare gateway rate limiting is in-memory per isolate and not durable/distributed (`framer-website/cloudflare/checkout-gateway/src/index.ts`).
2. CRM has role/debug fallback paths that can mutate persistent role state if RPC path is unavailable (`trip-with-nomads-crm/src/lib/actions/crm-core.ts`).
3. Attendance manager alerts are broadly broadcast and may leak cross-team operational signals (`trip-with-nomads-crm/src/lib/actions/attendance.ts`).
4. Deployment/runtime mismatch risk from mixed Vercel migration and retained Cloudflare/OpenNext scripts in CRM (`trip-with-nomads-crm/package.json`).
5. Governance controls are still heavily local-hook dependent and not fully trustless server-side.

## Later Optimization

1. Large CRM action files mix query, auth, notifications, and formatting concerns.
2. Migration/policy drift risk across staging/prod is manageable but needs continuous parity checks.
3. Duplicate/overlapping env-resolution helpers in CRM can be consolidated.

---

## 3) Best-Practice Reconciliation (Code vs Current Guidance)

### 3.1 Supabase Edge Function Guidance

Reference direction:
- Use explicit caller auth models per function.
- Prefer named secret keys / explicit service-to-service auth checks.
- Avoid broad anonymous reach for sensitive mutation endpoints.

Current gaps:
- Multiple write-sensitive functions remain permissive in CORS and trust boundary assumptions.
- Retry/payment-related auth pattern is weaker than recommended signed-token boundary.
- Secret fallback strategy for booking-status token increases blast radius.

Classification:
- Must-fix now: endpoint auth tightening, retry auth hardening, token secret model.

### 3.2 Cloudflare Worker Rate-Limit Guidance

Reference direction:
- In-memory maps are not strong distributed rate-limit controls.
- Prefer scoped durable mechanisms (Durable Objects/KV/WAF rules) per threat model.

Current gaps:
- Gateway uses process memory `Map` only, which is isolate-local and ephemeral.

Classification:
- Should-fix soon: move to durable/scalable rate-limit architecture.

### 3.3 Next.js Server Action Security Guidance

Reference direction:
- Treat server actions as public mutation boundaries.
- Enforce authorization in every action even when UI hides controls.

Current gaps:
- Several lead mutation actions rely on context presence but skip ownership/manager checks.

Classification:
- Must-fix now: enforce authorization guard on every mutation action.

---

## 4) Lane-by-Lane Implementation Backlog (Narrow PR Slices)

Each PR should remain lane-specific and independently verifiable.

### PR Slice F1 (Framer lane) - Endpoint Security Baseline
- Scope:
  - Replace wildcard CORS with explicit allowlist helper across write-sensitive functions.
  - Add method/content-type validation where missing.
- Files:
  - `framer-website/supabase/functions/create-booking/index.ts`
  - `framer-website/supabase/functions/record-lead/index.ts`
  - `framer-website/supabase/functions/retry-payment/index.ts`
  - `framer-website/supabase/functions/validate-coupon/index.ts`
  - `framer-website/supabase/functions/handle-payment/index.ts`
- Verification:
  - Function-local smoke calls (allowed origin, rejected origin, wrong method).
  - Checkout happy path still succeeds in staging.

### PR Slice F2 (Framer lane) - Booking/Retry Token Hardening
- Scope:
  - Migrate booking status token to strict dedicated secret, no fallback to PayU salts.
  - Require signed token or one-time nonce for retry-payment.
- Files:
  - `framer-website/supabase/functions/_shared/booking_status_token.ts`
  - `framer-website/supabase/functions/retry-payment/index.ts`
  - `framer-website/supabase/functions/get-booking-status/index.ts` (if contract changes)
- Verification:
  - Positive and negative token tests.
  - Retry succeeds only with valid token path.

### PR Slice F3 (Framer lane) - Gateway Abuse Resistance
- Scope:
  - Move write-route throttling from in-memory map to durable strategy.
  - Keep per-route limits and explicit error telemetry.
- Files:
  - `framer-website/cloudflare/checkout-gateway/src/index.ts`
  - `framer-website/cloudflare/checkout-gateway/wrangler.toml` (bindings if needed)
- Verification:
  - Burst test shows deterministic 429 behavior across worker instances.
  - No regression in normal checkout traffic.

### PR Slice C1 (CRM lane) - Lead Mutation Authorization Guard
- Scope:
  - Add shared guard (`manager OR owner`) and call it before each lead mutation.
  - Apply to follow-up/contact/details/delete-sensitive paths.
- Files:
  - `trip-with-nomads-crm/src/lib/actions/leads.ts`
  - `trip-with-nomads-crm/src/lib/actions/crm-core.ts` (if shared guard extracted there)
- Verification:
  - Unit tests: owner allowed, manager allowed, unrelated user blocked.
  - Manual role matrix checks in staging UI.

### PR Slice C2 (CRM lane) - Auth Redirect + Debug Role Safety
- Scope:
  - Harden `next` path normalization against protocol-relative and malformed inputs.
  - Remove persisted debug-role fallback mutation path; keep strictly controlled mechanism.
- Files:
  - `trip-with-nomads-crm/src/app/auth/callback/route.ts`
  - `trip-with-nomads-crm/src/app/auth/confirm/route.ts`
  - `trip-with-nomads-crm/src/lib/actions/crm-core.ts`
  - `trip-with-nomads-crm/src/app/dashboard/layout.tsx` (if debug control moved)
- Verification:
  - Redirect fuzz tests (`//`, encoded variants, external forms).
  - Debug role change works only through approved path.

### PR Slice C3 (CRM lane) - Attendance Scope and Abuse Controls
- Scope:
  - Restrict manager alert fan-out by manager scope/team ownership.
  - Add basic abuse controls for auto-break endpoint.
- Files:
  - `trip-with-nomads-crm/src/lib/actions/attendance.ts`
  - `trip-with-nomads-crm/src/app/api/attendance/auto-break/route.ts`
  - `trip-with-nomads-crm/src/lib/auth/manager-scope.ts` (if reused)
- Verification:
  - Team-scoped notifications only.
  - Repeated auto-break calls are bounded/idempotent.

### PR Slice R1 (Root lane) - Trustless Governance Parity
- Scope:
  - Mirror critical local-hook checks with required CI checks.
  - Align docs/templates and enforceable policy rules.
- Files:
  - `.github/workflows/repo-verify.yml`
  - `.github/pull_request_template.md`
  - `scripts/repo-guard.mjs`
  - `docs/VERSIONING.md` (if needed for policy alignment)
- Verification:
  - CI fails when branch/policy/secrets violate expected rules.
  - Required status checks match branch protection settings.

---

## 5) Verification Matrix for Execution Phase

Minimum verification per lane before merge:

- Framer lane:
  - Function tests for auth/CORS/method handling.
  - Gateway parity checks and checkout success path test.
- CRM lane:
  - Role matrix tests for every lead mutation action.
  - Auth callback redirect safety tests.
  - Attendance side-effect behavior tests.
- Root lane:
  - CI policy failure simulations.
  - Secret scan and repo guard regression checks.

---

## 6) Open Unknowns Requiring Environment Confirmation

1. Whether staging/prod both run latest security migrations in the same order.
2. Whether all production checkout traffic already goes through the gateway (no direct function bypasses).
3. Whether dedicated booking-status secret is set everywhere.
4. Whether production RLS policies already compensate for missing app-layer lead mutation checks.
5. Whether reverse-proxy headers can be trusted for callback base URL generation.
