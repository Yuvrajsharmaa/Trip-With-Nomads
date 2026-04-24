# CRM v2 — Build Status Tracker

> **Last Updated**: 2026-04-22
> **Current Slice**: Slice 6 — Stabilization + UX Upgrade
> **Blocking**: Nothing

---

## Build Slices Progress

### Slice 1: Foundation + Sales Agent Dashboard
### ✅ Completed Tasks (Slice 1)
- [x] Initialized CRM v2 with Shadcn/Next.js
- [x] Connected Supabase Auth (Shared JWT via tripwithnomads.com)
- [x] Finalized Navigational Architecture (Role-based Sidebar + Rail)
- [x] Implemented Dashboard "Delight" Phase
- [x] Production Deployment to `crm.tripwithnomads.com`
- [x] Real-time Supabase Leads Table with Search/Filters
- [x] `import-leads` Edge Function created

### Slice 2: Sales Manager Dashboard
### ✅ Completed Tasks (Slice 2)
- [x] Created `lead_notes` table for timeline logs.
- [x] Server Actions: `assignLead`, `updateLeadStatus`, `getLeadNotes`.
- [x] `LeadSideSheet` replacing full screen push.
- [x] Follow-Up Progress Bar UI (strictly 5 check-ins).

### Slice 3: Team Monitor & Attendance
### ✅ Completed Tasks (Slice 3)
- [x] **Team Monitor**: Agent Card grid view for Sales Managers.
- [x] **Attendance Widget**: Top-rail live timer (WFO/WFH, breaks).
- [x] **Shift Enforcer**: Logout blocked until 8 hours logged.

### Slice 4: Dashboard Overhaul (Action Center)
### ✅ Completed Tasks (Slice 4)
- [x] **Consolidated Action Center**: Workspace-first layout in `/dashboard`.
- [x] **Kanban Performance Overhaul**: Fluid `dnd-kit` with `onDragOver` sorting.
- [x] **Fixed Layout & Scroll**: Only Kanban board area is scrollable.
- [x] **Pipeline Optimization**: Removed 'Assigned' stage; leads move to `F/UP 1` on claim.
- [x] **UI Normalization**: Full Shadcn primitive refactor of all Lead forms.
- [x] **Environment Stabilization**: Resolved 'Maximum update depth exceeded' error, fixed hydration mismatches, and enforced strict vertical scroll containment.

### Slice 5: Lead Profile Redesign
### ✅ Completed Tasks (Slice 5)
- [x] **Notion-Style Layout**: Replaced 6-card fragmented dashboard with single-column document layout.
- [x] **Inline Editing**: Name, email, phone are click-to-edit with validation and toast feedback.
- [x] **Properties Grid**: Compact icon+label+value rows replacing card-wrapped sections.
- [x] **Notes Composer**: Full-width textarea with ⌘+Enter shortcut, type selector, and Post button.
- [x] **Timeline with Date Grouping**: Notes grouped by Today/Yesterday/Date with clean text entries.
- [x] **Removed AI Slop**: Eliminated fake "Engagement Score 84/100", decorative "+2" avatars, "Active Draft" indicator.
- [x] **Server Action**: `updateLeadContact` for inline editing with email/phone validation.
- [x] **Optimistic Updates**: Status and follow-up changes apply instantly with rollback on error.
- [x] **Mobile Responsive**: Single-column layout adapts cleanly from 375px to 1440px.
- [x] **Dashboard Due Task Persistence**: Manager dashboard checkbox now persists and advances `next_follow_up_at` via server action.
- [x] **Hydration Safety Fix**: Removed invalid `<div>` inside `<p>` in tasks page header to prevent runtime hydration errors.
- [x] **Deployment Hardening**: `cf:deploy` now always runs fresh OpenNext build and deploys explicitly to top-level routed environment (`--env ""`).
- [x] **Lint Cleanup (Tasks Surface)**: Cleared unused imports/vars in dashboard tasks components and verified clean lint for changed files.

### Slice 6: Stabilization + UX Upgrade
### ✅ Completed Tasks (Slice 6)
- [x] **Profile Screen Redesign & Layout Optimization**: Restructured the `TeamMemberProfile` screen to follow a "Scan-First" aesthetic. Extracted core identity into a persistent top-level left-aligned header. Eliminated the redundant "Access & Roles" tab and Quick Info card, moving all editable settings into a single, clean "Edit Profile" popup (Sheet). Improved tab navigation and reorganized "Overview" with high-density metric cards.
- [x] **Shadcn Policy Guardrails**: Added ESLint `no-restricted-imports` gate for non-shadcn UI kits and documented allowed stack in `trip-with-nomads-crm/docs/CRM_COMPONENT_POLICY.md`.
- [x] **Export Policy Enforcement**: Removed CRM leads table Export CTA as CSV exports are out of scope.
- [x] **Request-Scoped Auth/Profile Caching**: Added shared auth context helper and wired core routes (`/dashboard`, `/dashboard/leads`, `/dashboard/leads/[id]`, `/dashboard/tasks`, `/dashboard/attendance`, `/dashboard/settings`, `/dashboard/team`) to reduce duplicate auth/profile fetches.
- [x] **Performance Query Consolidation**: Refactored dashboard insights to aggregate active leads from a single main query (plus weekly closed counters), reducing round-trips.
- [x] **Core Route Skeleton UX**: Added route-level loading skeletons for `/dashboard`, `/dashboard/leads`, `/dashboard/leads/[id]`, `/dashboard/tasks`, `/dashboard/attendance`.
- [x] **Dashboard Closed Leads Widget**: Implemented separate Won vs Dropped widget with ranges (today, yesterday, 1w, 1m, 3m, 6m, 1y, custom range) via shadcn controls.
- [x] **Theme-Aware Charts**: Removed hardcoded grayscale usage and switched dashboard chart coloring to theme token-driven blending that responds to preset/theme changes.
- [x] **Unified Task System (Dashboard + Tasks Page)**: Added shared `UnifiedTaskItem` pipeline combining `crm.tasks` and lead follow-ups with urgency sorting; manager dashboard and tasks page now read from shared source.
- [x] **Tasks Empty + CTA State**: Added explicit zero-state messaging and create-task CTA for unified tasks surfaces.
- [x] **Follow-up DateTime UX Upgrade**: Reworked lead profile follow-up control to explicit date + time flow (IST display behavior preserved with UTC persistence).
- [x] **Post-Move Missing Follow-up Prompt**: Added non-blocking guided prompt after status/kanban stage moves when follow-up is missing.
- [x] **Structured Lead Activity Logging**: Added new action layer and UI timeline rendering for change events (field/status/follow-up/reassign/escalation/task/merge) in lead profile.
- [x] **Trip Searchable Selector**: Added published-trip searchable selection with custom-trip fallback and lead-type inference in lead profile flow.
- [x] **Duplicate Merge Backend Foundation**: Added duplicate queue server actions + transactional merge path scaffolding (queue scan + merge RPC integration points).
- [x] **Duplicate Queue UI + Import Warnings Flow**: Added manager-facing `/dashboard/leads` duplicate queue panel with scan, pending/resolved filters, merge/ignore actions, and explicit import-warning alert state.
- [x] **Duplicate Queue Tab + Exclusion Rules**: Moved duplicate workflow into a manager/admin-only `Duplicates` tab on Leads, added pending red-dot indicator, and excluded pending duplicate pairs from all normal lead tabs/counts until resolved.
- [x] **Sidebar Active Route Highlight**: Fixed nav active state across all dashboard routes via pathname matching on primary + secondary sidebar menus.
- [x] **Leads/Tasks Surface Normalization**: Updated copy, sizing, and page spread to align `/dashboard/leads` and `/dashboard/tasks` with the rest of CRM workspace layouts.
- [x] **Leads Query Runtime Fix**: Corrected duplicate-exclusion UUID filter serialization to prevent `/dashboard/leads` fetch errors in production.
- [x] **Duplicate Queue Cleanup (Production)**: Executed bulk merge of all pending duplicate queue pairs via `crm.merge_duplicate_leads`; pending queue reduced to zero.
- [x] **Leads Error Diagnostics Hardening**: Added structured Supabase error logging in leads fetch path so runtime failures no longer surface as empty `{}` logs.
- [x] **Trip Backfill Recovery**: Backfilled missing `trip_slug`/`trip_id` for imported leads using URL-to-trip slug mapping; 393 leads recovered in production.
- [x] **Escalation Notification Pipeline**: Added `crm.notifications` storage + in-app bell dropdown so escalation/approval alerts are now visible to managers in CRM.
- [x] **Team Control Center v1**: Replaced legacy Team screen with manager/admin-only control center combining hierarchy, activity timeline, approvals queue/history, agent metrics, goal setting, and attendance CSV export.
- [x] **Attendance UX Refresh**: Improved attendance board with summary metrics and running-month-only weekly off window selection workflow.
- [x] **Tasks Loader Normalization**: Updated `/dashboard/tasks` skeleton to match full-width workspace composition and table rhythm.
- [x] **Team Invitation Lifecycle**: Added `crm.team_invitations` model with token hash, expiry, pending/accepted/revoked/expired states, resend/revoke controls, and acceptance tracking.
- [x] **Invite Token Wiring (Auth Flow)**: Connected invite token flow across `/signup` → `/verify-otp` → `/onboarding`, with invitation resolution and acceptance commit on onboarding.
- [x] **Team Control Center v2 Layout**: Shifted Team Hub to vertical-tab architecture (`Control Center`, `Members`, `Invites`, `Activity`, `Approvals`, `Metrics & Goals`) for large-surface navigation.
- [x] **Metrics Delta View**: Added period-over-period deltas for won, dropped, tasks done, and attendance hours in Team metrics.
- [x] **Tasks Completion Safety**: Removed instant completion behavior from dashboard task widget, added explicit confirm-to-complete flow, undo for CRM task completion, and completed-task visibility in Tasks workspace.
- [x] **Completed Tasks Visibility**: Tasks workspace now loads with `includeDone=true` and adds `Active / Completed / All` view controls.
- [x] **Leads by Destination Widget**: Added destination distribution widget to manager dashboard and role-focused operational widget panel.
- [x] **End Shift Without Logout**: Added explicit shift clock-out action in attendance widget and user menu; logout gate now only applies to active unclosed shifts.
- [x] **Manager Dashboard Scan Mode**: Reworked manager dashboard into a fast-scan default (`Manager Scan`) with deeper analytics moved into a separate `Deep Insights` tab to reduce widget clutter and repeated signal.
- [x] **Attendance Week-Default History Navigation**: Added week-default attendance range filtering (with month/quarter/half-year/year/custom options) and reorganized attendance layout so session history is full-width at the bottom for long-range scanning.
- [x] **Leads Filter + Trip-Type Reliability**: Added follow-up urgency filter (`Due Today`, `Overdue`, `Unscheduled`) and upgraded trip backfill to populate both trip mapping and domestic/international `trip_type` classification.
- [x] **Hydration + Drift Stabilization Sweep**: Fixed invalid nested anchor composition in agent dashboard follow-up rows, removed accidental `page 2.tsx` backup routes, and removed team CSV export route/surfaces to align with current CRM component policy.
- [x] **Dashboard IA Normalization (Manager + Agent)**: Reworded KPI and queue copy into manager/agent decision language, reduced repeated cards, and enforced fast-scan top widgets with deeper trend context moved into `Deep Insights`.
- [x] **Team Control Center v3**: Replaced hierarchy-heavy layout with team-tabbed member control sheet, action-first member table (`Profile`, `Edit`), invite workflow from table context, and cleaner approvals/activity/invite surfaces.
- [x] **Dedicated Member Deep-Dive Route**: Added `/dashboard/team/members/[id]` with settings-style tabs (`Overview`, `Attendance`, `Activity`, `Access & Roles`) including full HR edit (name/email/role/team/status) and save-state UX.
- [x] **Scoped Manager Authorization**: Added managed-team scope resolver and enforced scope checks for team visibility, invite lifecycle actions, and member profile update actions (admin global, manager scoped).
- [x] **Attendance IA v2**: Split attendance into `Session History` and `Requests` tabs, converted time-off/week-off records to table views, preserved week-default scan, and added manager agent filter + long-range controls.
- [x] **Leads Contract + Kanban Usability Upgrade**: Extended leads server query + URL filters (`owner`, `team`, `status`, `created_from`, `created_to`) and refined kanban for horizontal scan/touch-safe card actions.
- [x] **Trip Classification Write-Side Hardening**: Updated quick-add/profile trip updates to keep `lead_type` and `trip_type` synchronized for domestic/international filtering consistency.
- [x] **Leads Toolbar Scan-First Refactor**: Replaced overloaded leads filters row with quick filters + advanced filters sheet + active filter chips and clear actions, while preserving URL-backed server query behavior.
- [x] **Dashboard Harmonization (Agent/Manager/Admin)**: Removed manager deep-insights tab split, surfaced trend/context widgets directly in one flow, added scan-first KPI strips for agent/manager, and introduced admin-specific dashboard grid with approvals/exceptions/team-risk widgets.
- [x] **Role-Typed Dashboard Contracts**: Added `ManagerDashboardInsights` + `AdminDashboardInsights` types and shipped `fetchAdminDashboardInsights` payload for pending approvals and team-risk summaries.
- [x] **HTML Blueprint Ingestion + Profile Shell Lock**: Parsed provided local shadcn profile HTML into a reusable CRM blueprint (`trip-with-nomads-crm/docs/CRM_UI_BLUEPRINT.md`) and linked it in component policy for future implementation consistency.
- [x] **Dashboard Harmonization v3 Correction Pass**: Removed non-operational dashboard assumptions, made shared pipeline/analytics widgets theme-token compliant, excluded `new` from sales pipeline widget stages, and reduced repeated admin queue surfaces to keep every widget element decision-meaningful and backed by live CRM data.
- [x] **System Reset v4 Baseline**: Added shadcn system contracts (`docs/CRM_SHADCN_DESIGN_SYSTEM.md`, `.interface-design/system.md`), switched dashboard pipeline to display buckets (`unassigned` + follow-up stages), tightened task scope defaults to assignee context, removed manager/admin dashboard task/queue drift widgets, and rebuilt member activity flow to day-scoped preview + side-sheet details.
- [x] **System Reset v4 Continuation**: Enforced non-admin manager edit guardrails on member profiles, removed repeated access-edit blocks from profile overview, kept a single editable access surface with explicit permission messaging, and tightened agent dashboard status/urgency color usage to semantic CRM tokens.
- [x] **System Reset v4 Worktree Cleanup Pass**: Removed unused dashboard payload drift (`decision_queue`, `team_risk_rows`) so only rendered metrics are queried/carried, and replaced the last hardcoded agent urgency border class with a semantic CRM token.
- [x] **Runtime Stabilization (Turbopack)**: Hardened Supabase auth/profile resolution in middleware and request context with guarded error handling so transient fetch failures no longer crash with generic Turbopack runtime errors.
- [x] **Duplicate Queue Reliability + Merge Workflow UX**: Replaced fragile duplicate-queue relation hydration with explicit lead identity lookup, surfaced queue load mismatch/error states in the Duplicates tab, and strengthened merge/ignore workflow clarity with confidence + side-by-side merge context.
- [x] **Dashboard Visual Purpose Pass (Admin + Agent)**: Reworked admin dashboard widget color semantics to reduce primary overuse and aligned agent follow-up queue rows/chips to shadcn task-card composition for cleaner scan-and-act behavior.
- [x] **Dashboard Role Redesign (Analytics-First + Minimal Palette)**: Added agent-scoped dashboard insights contract, wired role-correct dashboard payload selection, moved sales-agent view to analytics-first IA (pipeline + outcome/risk before action widgets), replaced admin assignment-pressure KPI with active pipeline load, and normalized analytics widget palette to neutral semantic ramps.
- [x] **Duplicate Queue Workflow Rebuild (Analyze → Compare → Decide)**: Replaced dense duplicate-table rows with a queue worklist + focused pair-review panel, added queue sorting (`Newest`, `Highest confidence`), surfaced decision-focused queue KPIs, and introduced explicit dismiss-confirmation with optional note so merge/ignore actions are intentional and easier to execute.
- [x] **Duplicate Queue Simplification Pass (Human-Readable Review)**: Reduced duplicates screen complexity by removing non-essential KPI/sort clutter, simplifying warning copy, and prioritizing readable lead names/phones over technical IDs so managers can decide faster with less cognitive load.
- [x] **Duplicate Queue Ultra-Minimal Flow + Auto-Merge**: Converted duplicate handling into a single-pair reviewer (`Pair X of N` with Previous/Next), removed non-essential metadata (including detected-time emphasis), and added one-click `Auto-merge safe pairs` (99%+ matching-phone rule) to resolve large batches quickly without manual row-by-row review.
- [x] **Leads Table Bulk Action Finalization**: Integrated high-performance server actions (`bulkAssignLeads`, `bulkArchiveLeads`, `bulkUpdateLeadStatus`) into the Leads table. Moved the selection action bar to a persistent inline UI at the top of the table for better ergonomics and high-density scan capability.
- [x] **Team Member Profile V3 Layout**: Finalized the transition of the profile screen to a professional dashboard layout. Identity and core info are now in a persistent left sidebar, while metrics and history reside in the main content area. Replaced fragmented tabs with a single "Edit Profile" Sheet for a cleaner, unified edit flow.
- [x] **Post-Handoff Stabilization (Syntax + Type + Deploy)**: Fixed `TeamMemberProfile` JSX breakage (`duplicate return`, wrapper closure mismatch), restored strict type safety (`LeadStatus` import + profile date guard), and verified Cloudflare deployment pipeline (`cf:deploy`) end-to-end with new live Worker version.
- [x] **Team Profile Inline Editing (Notion-style)**: Removed the side-sheet profile editor and migrated team-member profile fields (`full name`, `email`, `role`, `team`, `status`) to direct inline editing with per-field save and permission-aware guardrails.
- [x] **Team Profile Quiet Edit Mode + In-Tab Filters**: Shifted profile fields to view-first editing (controls appear only when activated), moved range/date filtering into Overview/Activity/Attendance tab contexts, and reduced visual noise in tab/card hierarchy for a calmer scan flow.
- [x] **Team Profile Tab Micro-Polish**: Improved per-tab layout rhythm with clearer section headers, calmer KPI card anatomy, cleaner recent-activity rows, activity event count context, and attendance summary components (days/total/average) above history table.
- [x] **Auth Recovery Flow Hardening (Forgot/Reset)**: Rewired forgot-password page to real Supabase reset action, normalized reset-password shell, and updated middleware public-route handling so recovery routes work reliably for signed-out users.
- [x] **Settings Security IA Refresh**: Rebuilt `/dashboard/settings` into account/security/appearance tabs with dedicated verified email-change request and password-reset controls plus clearer security guidance.
- [x] **Team Email Edit Guardrail**: Disabled manager-side direct email mutation in team member profile/actions and enforced verified user-initiated email changes from Settings > Security.
- [x] **Settings IA + Avatar Foundation Refresh**: Rebuilt `/dashboard/settings` into shadcn-style two-pane information architecture (left nav + focused section panel), removed preset theme customizer from appearance workflow, and added profile photo controls with upload/URL + global sidebar identity usage.
- [x] **Onboarding UX Refresh**: Reworked `/onboarding` into clearer card-based role selection + profile submission flow while preserving invitation-lock and pending-approval logic.
- [x] **Attendance IA Simplification**: Restructured attendance into cleaner request workflow (single submission surface + tabbed history) with calmer hierarchy and reduced form fragmentation.
- [x] **Kanban Scroll Containment Hardening**: Stabilized board viewport horizontal scroll behavior by isolating scroll container and resetting stale offset on mount/data refresh.
- [x] **CRM Correction + Harmonization Pass (Settings/Attendance/Kanban/Onboarding/Dashboards)**: Moved admin role simulation to topbar role slot, removed Settings debug/URL-avatar/duplicate security actions, restored shadcn light-dark cards synced with header toggle, converted Attendance request forms to dialog actions with history-first flow, enforced kanban overflow containment against sidebar overlap, refreshed onboarding hierarchy without logic changes, and normalized admin/manager dashboard KPI/closed-card accent usage for lower visual noise.


---

## Change Log
| Date | Change | By |
|---|---|---|
| 2026-04-22 | Completed CRM correction+harmony sweep: topbar admin role dropdown (debug switch), settings IA cleanup (no avatar URL, single reset entrypoint, restored light/dark appearance cards), attendance request dialogs, kanban overflow containment, onboarding layout refresh, and role dashboard visual-noise reduction. | Codex |
| 2026-04-22 | Stabilized local CRM workspace by quarantining accidental duplicate source artifacts (`* 2.tsx/ts/json`) outside repo, then shipped settings IA redesign with profile photo support, onboarding UX refresh, attendance IA simplification, and kanban horizontal scroll containment fixes. | Codex |
| 2026-04-21 | Hardened auth recovery + settings security: fixed forgot/reset route access and page wiring, redesigned settings security flows, and removed unverified direct email edits from team-member management path. | Codex |
| 2026-04-21 | Applied component-level micro-polish across Overview/Activity/Attendance tabs (hierarchy, spacing, typography, and summary blocks) with no workflow behavior changes. | Codex |
| 2026-04-21 | Refined Team Member Profile into quiet view-first inline editing with tab-local date controls and reduced visual clutter, plus accessibility label pass on inline controls. | Codex |
| 2026-04-21 | Replaced Team Member Profile side-sheet editing with inline field-level editing (name/email/role/team/status) to match lead-profile ergonomics and reduce UI clutter. | Codex |
| 2026-04-21 | Fixed Team Member Profile parse/type blockers and completed fresh Cloudflare deploy (version `5ca17262-ab30-431e-8d70-331ba93fcbf7`) after verification (`eslint`, `tsc`, `next build`). | Codex |
| 2026-04-20 | Finalized Leads table bulk actions (Assign, Won, Dropped, Archive) and refactored Team Member Profile to a professional Sidebar + Content dashboard layout. | Antigravity |
| 2026-04-18 | Refactored Leads Table structure: Moved bulk action bar from floating-bottom to inline top-aligned interface, standardized bulk actions, permanently hid archived leads from main table, and introduced a dedicated 'Archived' view for explicit access. | Codex |
| 2026-04-18 | Simplified duplicate queue into a single-column reviewer with Previous/Next navigation and introduced bulk auto-merge for safe high-confidence phone matches to process large pending sets in one action. | Codex |
| 2026-04-18 | Simplified duplicate review IA by stripping extra KPI/sort noise and converting pair rows to human-readable name/phone-first presentation with one clear compare-and-resolve path. | Codex |
| 2026-04-18 | Rebuilt Leads `Duplicates` tab into an analyze-first flow with left-side review queue, right-side side-by-side pair comparison, sortable prioritization, explicit merge decision zone, and confirmation-based dismiss with note support. | Codex |
| 2026-04-18 | Rebuilt Dashboard IA, simplified agent views, and improved admin widgets. | Codex |
| 2026-04-18 | Restructured Team Member Profile layout with persistent header, improved tab navigation, high-density metric cards, and cleaned up form structures to follow a "Scan-First" minimal aesthetic. | Codex |
| 2026-04-06 | System design locked. | Yuvraj + Antigravity |
| 2026-04-10 | Consolidated Dashboard into Action Center. | Antigravity |
| 2026-04-12 | Finalized Shadcn Normalization + Bulk Actions. | Antigravity |
| 2026-04-12 | Performance & Stability: Resolved Infinite Loop + Enforced Scroll Lockdown. | Antigravity |
| 2026-04-13 | Lead Profile Redesign: Notion-style document layout with inline editing. | Antigravity |
| 2026-04-14 | Dashboard task persistence, hydration fix, deploy hardening, and lint cleanup. | Codex |
| 2026-04-14 | Slice 6 stabilization pass: shadcn policy gate, route skeletons, unified tasks, closed-leads widget, follow-up datetime prompt, activity logging, trip selector, and duplicate-merge backend foundation. | Codex |
| 2026-04-14 | Duplicate queue manager UI + import-warning workflow on Leads page, including scan/merge/ignore actions. | Codex |
| 2026-04-14 | Duplicate tab migration + pending-pair exclusion from normal lead counts/lists, sidebar active highlighting fix, and leads/tasks layout-copy normalization. | Codex |
| 2026-04-14 | Fixed leads fetch runtime error from duplicate exclusion filter and bulk-merged all pending duplicate queue items in production. | Codex |
| 2026-04-14 | Hardened leads fetch diagnostics with structured Supabase error payload logging and redeployed CRM. | Codex |
| 2026-04-14 | Added notifications + team goals DB foundation, backfilled 393 missing trip mappings, launched Team Control Center v1, refreshed attendance UX, and deployed live build. | Codex |
| 2026-04-14 | Added team invitation token lifecycle (DB + actions + Team Hub invite management), wired signup/onboarding acceptance tracking, delivered Team Hub v2 vertical navigation and metrics deltas, implemented safe task completion UX with completed view, added Leads by Destination manager widget, and enabled End Shift without logout. | Codex |
| 2026-04-14 | Shifted manager dashboard to scan-first + deep-insights architecture, implemented week-default attendance history controls with full-width table composition, and added leads follow-up urgency filter plus trip-type backfill enrichment. | Codex |
| 2026-04-14 | Completed scan-first CRM refactor sweep: fixed dashboard nested-anchor hydration errors, removed drift files and export route, rebuilt Team Control Center v3 with scoped-manager permissions + dedicated member profile route, upgraded attendance into session/request tabs with table-first history and manager agent filter, expanded leads URL/server filters (owner/team/stage/date), improved kanban scan ergonomics, and hardened trip type mapping to always write both `lead_type` and `trip_type`. | Codex |
| 2026-04-14 | Implemented shadcn-consistent dashboard harmonization: leads table quick/advanced filter architecture, manager no-tab unified insight flow, agent KPI-first scan layout, and dedicated admin overview with approvals/exceptions/team-risk widgets backed by new role-typed insights contracts. | Codex |
| 2026-04-14 | Performed focused widget visual normalization pass across role dashboards: unified stat-card anatomy, calmer border hierarchy, tighter typography scale, and cleaner queue/action row styling with strongest corrections on agent dashboard scan flow. | Codex |
| 2026-04-14 | Ingested local shadcn profile HTML into a reusable CRM UI blueprint, then shipped dashboard correction pass to remove invented signals, align widgets to real CRM data, enforce theme-token-driven pipeline/analytics coloring, and exclude `new` from sales-pipeline stages shown to users. | Codex |
| 2026-04-15 | Implemented v4 system reset baseline: display-pipeline contract, assignee-scoped task defaults, manager/admin dashboard simplification, day-scoped member activity with side sheet, removed profile completion, and TWN SVG favicon/sidebar branding. | Codex |
| 2026-04-15 | Continued v4 stabilization: blocked scoped-manager edits on admin profiles, de-duplicated member profile editing IA, and aligned remaining agent dashboard urgency accents to semantic CRM token classes. | Codex |
| 2026-04-15 | Finalized v4 worktree cleanup by removing unused dashboard payload fields (`decision_queue`, `team_risk_rows`) and replacing remaining hardcoded urgency border classes with semantic CRM tokens. | Codex |
| 2026-04-15 | Stabilized runtime auth path by wrapping middleware/request-context Supabase calls in error guards to prevent generic Turbopack runtime crashes on transient fetch failures. | Codex |
