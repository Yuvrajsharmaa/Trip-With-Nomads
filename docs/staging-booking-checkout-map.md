# Staging booking and checkout map

This is the read-only integration map used for the booking hardening work. It
contains deployment evidence, not credentials or payment data.

| Surface | Observed staging value | Evidence / boundary |
| --- | --- | --- |
| Checkout | `https://maroon-aside-814100.framer.app/checkout` | HTTP 200 and deployed Framer bundle inspection |
| Gateway | Razorpay | Staging bundle contains the Razorpay checkout path |
| Checkout gateway origin | `https://twn-checkout-gateway-staging.tripwithnomads-crm.workers.dev` | Staging bundle inspection |
| Supabase project | `ieuwiinbvbdvjrdqqzlb.supabase.co` | Staging bundle inspection |
| Browser callback | `handle-payment` redirect adapter | Source implementation; it does not mutate payment state or Sheets |
| Payment authority | `razorpay-webhook` | Source implementation; signature, event, provider-state, amount, and currency checks precede reconciliation |

The worktree does not contain a webhook registration URL, Google service-account
credentials, configured Sheet IDs, or live tab values. Consequently, existing
headers, duplicate booking IDs, duplicate lead emails, orphan rows, and the
provider registration cannot be confirmed from this checkout. The read-only
audit command in [sheets-audit-repair.md](sheets-audit-repair.md) accepts an
exported fixture or an existing Sheet ID plus a short-lived read-only token.

Production is intentionally not pointed at the staging worker by default. A
production gateway origin must be supplied through the runtime configuration
override after staging validation and explicit authorization.
