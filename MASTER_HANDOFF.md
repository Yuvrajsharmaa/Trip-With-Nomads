# 🚀 Trip With Nomads — Master Workspace Handoff

> **Current workflow contract:** This folder is the public website/Supabase
> repository. The adjacent `trip-with-nomads-crm/` folder is a separate GitHub
> repository with independent branches and deployments. The parent checkout is
> context-only for agent threads; do not edit or use `git add .` there. Read
> [docs/CROSS_REPO_WORKFLOW.md](docs/CROSS_REPO_WORKFLOW.md) and the CRM
> `AGENTS.md` before work that touches both products. The historical notes below
> are retained for provenance and are not the current payment or branching
> contract.

This document summarizes the current state of the **Trip with Nomads** project for use in the Framer website workspace.

## 📂 Project Organization

The active project root is `Trip-With-Nomads`.

1.  **`framer-website/`**:
    - **Purpose**: Core logic for the production Framer site.
    - **Key Files**: `BookingOverrides.tsx` (3-step flow), `edge-functions/` (PayU integration).
    - **Data**: All trip/pricing source JSONs and CSVs are in `data/`.
2.  **Shared Resources**:
    - `supabase/` for database migrations/schema and edge functions.
    - `scripts/` for sync/deploy/workflow utilities.

## 🛠 Active Technical Plan

The primary objective is to finalize the **Supabase + PayU Booking Flow**. 

### Current Progress:
- [x] Reorganized code into clean directories.
- [x] Consolidated shared context (Implementation Plan, Scripts, Data).
- [ ] **Next Step**: Update the `create-booking` Edge Function to handle the multi-traveller payload.
- [ ] **Next Step**: Update `BookingOverrides.tsx` to collect email/phone on Step 2.

## 🔑 Critical Environment Info

- **Supabase Project ID**: `jxozzvwvprmnhvafmpsa`
- **Tables**: `trips`, `trip_pricing`, `bookings` (needs update).
- **Payment Gateway**: PayU (Key/Salt are stored in Supabase Secrets).

## 🤖 Instructions for the New Workspace Agent

1.  **Scope**: This repository is for the **Framer Website** (customer-facing) and its backend utilities.
2.  **Implementation Plan**: Refer to `framer-website/IMPLEMENTATION_PLAN.md` for all technical milestones.
3.  **Data Sync**: Use the scripts in `scripts/` to keep local data and Supabase in sync.
4.  **Aesthetics**: Follow the "Premium Design" guidelines—TWN should look elite, modern, and high-performance.

---
*Created by Antigravity on 2026-02-22*
