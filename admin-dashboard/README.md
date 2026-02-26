# Admin Dashboard Project

This is the internal management dashboard for **Trip with Nomads**. It is built with React, Vite, and Tailwind CSS.

## 🚀 Purpose

The Admin Dashboard is used to:
- Manage Trips and Pricing.
- Monitor Bookings and Payment Statuses.
- Edit CMS content (integrated via Edge Functions/MCP).
- Handle administrative tasks for the TWN platform.

## 📂 Structure

- **`src/`**: The main React source code.
  - `pages/`: Dashboard views (e.g., CMSEditor).
  - `lib/mcp.ts`: Integration with Model Context Protocol for advanced AI assistance.
- **`supabase/`**: Shared backend infrastructure (migrations and Edge Functions).
- **`scripts/`**: Data management and audit scripts.
- **`data/`**: Reference data for trips and pricing.

## 🔗 Dependencies & Context

The dashboard connects directly to the same **Supabase** instance used by the Framer website.

## 🔐 Environment Setup

- Use `env.production.example` and `env.development.example` as templates.
- `VITE_SITE_BASE_URL` controls public trip links in the CMS browser.
- For script execution, load env explicitly:
  - `node --env-file=env.production.example scripts/<script>.mjs`
  - `node --env-file=env.development.example scripts/<script>.mjs`

---

### Shared with Framer Website
The following folders are kept in sync with the `framer-website` project for context:
- `supabase/`: Database schema and edge function logic.
- `scripts/`: Data management utilities.
- `data/`: Source of truth for trips.
- `IMPLEMENTATION_PLAN.md`: The overarching technical plan.

## 🛠 Getting Started

1. `cd admin-dashboard`
2. `npm install`
3. `npm run dev`
