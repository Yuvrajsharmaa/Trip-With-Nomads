# Framer Override Safe Push Workflow

Use this every time before pushing override code to live Framer.

## 1) Pull active override IDs from Framer first

1. Run `getProjectXml` via MCP.
2. Confirm current `CodeOverrides` block and map IDs to files.

Current known mapping:

- `perCTUm` -> `CheckoutPageOverrides.tsx`
- `u_WTK4w` -> `TripPriceOverrides.tsx`
- `jvQtnDE` -> `Bookingstatusoverride.tsx`
- `EaMDfOP` -> `EmailPopupOverride.tsx`

Do not assume IDs from old notes. Always re-pull before update.

## 2) Read remote file before write

For each target ID, run `readCodeFile` and check:

- file name matches expected override
- exported function list is present
- no emergency hotfix landed directly in Framer that is missing locally

## 3) Use guarded push script

From `framer-website/`:

- Dry-run:
  - `npm run framer:overrides:dry-run`
- Push checkout + trip price + booking status:
  - `npm run framer:overrides:push`
- Push only booking override (if active in project):
  - `node scripts/push_booking_overrides.mjs`

The safe script enforces:

- target ID/name resolution from Framer MCP before update
- remote backup snapshot before any write
- export parity check (blocks push if local is missing remote exports)
- readback verification after update

## 4) Optional targets are explicit

- Booking override is optional and pushed only with `--include-booking`.
- Email popup override is excluded by default; include only when intentionally updating:
  - `node scripts/push_overrides_safe.mjs --include-email --only=email`

## 5) Never delete functions accidentally

If the script reports missing remote exports, stop and merge remote/local first.
Do not bypass with `--allow-export-removal` unless the removal is intentional and reviewed.
