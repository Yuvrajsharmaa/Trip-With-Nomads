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

## Framer code overrides — critical architecture rules

The files below run as Framer overrides on the live website.
Breaking them breaks pricing, checkout, and lead capture.

### Override files (source of truth is this repo, not Framer)

| File | Framer ID | Purpose |
|------|-----------|---------|
| `framer-website/framer/TripPriceOverrides.tsx` | `u_WTK4w` | Trip card pricing, next-batch dates, discount badges |
| `framer-website/framer/CheckoutPageOverrides.tsx` | `perCTUm` | Trip detail page pricing, checkout flow, booking |
| `framer-website/framer/BookingStatusOverride.tsx` | — | Post-booking status page |
| `framer-website/framer/EmailPopupOverride.tsx` | — | Lead-capture email popup |

### Push workflow

Use `framer-website/scripts/push_overrides.mjs` to push override files to Framer.
Never hot-edit overrides directly in the Framer code panel.

### Slug validation rules (DO NOT RELAX)

1. **Hyphen requirement**: `normalizeSlug()` rejects single-word strings. Real trip slugs always contain at least one hyphen (e.g. `winter-spiti-expedition`). This prevents CSS values (`top`, `flex`), font names (`inter`), and other React prop values from being misidentified as trip slugs.
2. **`DEEP_SCAN_SKIP_KEYS`**: A `Set` of ~40 CSS/React/layout prop keys that the deep scanners (`findSlugInCmsProps`, `findTripIdInValue`) skip. Adding a key to this set is safe; removing one risks re-introducing false-positive slug matches.
3. **URL-path exception**: Single-word slugs are only accepted if they originate from a `/upcoming-trips/<slug>` URL path match.

### CRM repo (`trip-with-nomads-crm/`)

The CRM has its own repo and auto-deploys via Vercel.
Do **not** commit CRM changes alongside Framer override changes.
