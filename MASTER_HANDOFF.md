# 🚀 Trip With Nomads — Master Workspace Handoff

This document summarizes the current state of the **Trip with Nomads** project for use in a new, unified workspace.

## 📂 Project Organization

I have consolidated the entire ecosystem into a single root folder: `Trip-With-Nomads`.

1.  **`framer-website/`**: 
    - **Purpose**: Core logic for the production Framer site.
    - **Key Files**: `CheckoutPageOverrides.tsx` (checkout page flow), `BookingStatusOverride.tsx`, `edge-functions/` (PayU integration).
    - **Data**: All trip/pricing source JSONs and CSVs are in `data/`.
2.  **`admin-dashboard/`**: 
    - **Purpose**: Internal management tool (React/Vite).
    - **Tech**: Tailwind CSS, Supabase integration, MCP/AI hooks.
3.  **Shared Resources**: 
    - Both projects share the `supabase/` folder (database migrations/schema) and `scripts/` (for syncing CMS/Admin data).

## 🛠 Active Technical Plan

The primary objective is to finalize the **Supabase + PayU Booking Flow**. 

### Current Progress:
- [x] Reorganized code into clean directories.
- [x] Consolidated shared context (Implementation Plan, Scripts, Data).
- [x] Checkout page migration is active (`/checkout`) and popup flow is retired.
- [x] `create-booking` Edge Function accepts and processes multi-traveller payloads.

## 🔑 Critical Environment Info

- **Supabase Project ID**: `jxozzvwvprmnhvafmpsa`
- **Tables**: `trips`, `trip_pricing`, `bookings` (needs update).
- **Payment Gateway**: PayU (Key/Salt are stored in Supabase Secrets).

## 🤖 Instructions for the New Workspace Agent

1.  **Scope**: You are managing a dual-project repository. Always check if a task relates to the **Framer Website** (customer-facing) or the **Admin Dashboard** (internal).
2.  **Implementation Plan**: Refer to `framer-website/IMPLEMENTATION_PLAN.md` for all technical milestones.
3.  **Data Sync**: Use the scripts in `scripts/` to keep local data and Supabase in sync.
4.  **Aesthetics**: Follow the "Premium Design" guidelines—TWN should look elite, modern, and high-performance.

---
*Created by Antigravity on 2026-02-22*
