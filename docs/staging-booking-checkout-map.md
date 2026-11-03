# Staging booking and checkout map

This is the read-only integration map used for the booking hardening work. It
contains deployment evidence, not credentials or payment data.

| Surface | Observed staging value | Evidence / boundary |
| --- | --- | --- |
| Checkout | `https://maroon-aside-814100.framer.app/checkout` | HTTP 200 and deployed Framer bundle inspection |
| Payment provider | Razorpay | Staging bundle contains the Razorpay checkout path |
| Checkout API | `record-lead`, `create-booking`, and `retry-payment` on the staging Supabase project | Direct Edge Function calls are published to Framer staging and passed the recorded Razorpay Test Mode retry flow |
| Legacy checkout Worker | Not called by current Framer checkout source | Cloudflare retirement remains unverified; it is outside this Supabase release |
| Supabase project | `ieuwiinbvbdvjrdqqzlb.supabase.co` | Staging bundle inspection |
| Browser callback | `handle-payment` redirect adapter | Source implementation; it does not mutate payment state or Sheets |
| Payment authority | `razorpay-webhook` | Source implementation; signature, event, provider-state, amount, and currency checks precede reconciliation |

The worktree does not contain a webhook registration URL, Google service-account
credentials, configured Sheet IDs, or live tab values. Consequently, existing
headers, duplicate booking IDs, duplicate lead emails, orphan rows, and the
provider registration cannot be confirmed from this checkout. The read-only
audit command in [sheets-audit-repair.md](sheets-audit-repair.md) accepts an
exported fixture or an existing Sheet ID plus a short-lived read-only token.

The current Framer checkout sends each operation to its named Supabase Edge
Function; it does not route requests through a generic service-role Worker.
Production uses a separate Supabase project. This Staging map does not authorize
pointing Production at Staging services.
