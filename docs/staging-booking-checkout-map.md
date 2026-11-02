# Staging booking and checkout map

This is the read-only integration map used for the booking hardening work. It
contains deployment evidence, not credentials or payment data.

| Surface | Observed staging value | Evidence / boundary |
| --- | --- | --- |
| Checkout | `https://maroon-aside-814100.framer.app/checkout` | HTTP 200 and deployed Framer bundle inspection |
| Payment provider | Razorpay | Staging bundle contains the Razorpay checkout path |
| Checkout API | `record-lead`, `create-booking`, and `retry-payment` on the staging Supabase project | Current source branch; not yet published to Framer staging |
| Legacy checkout Worker | No longer referenced by current source; deployed retirement is unverified | TRI-75 release gate; this checkout cannot verify or retire its Cloudflare deployment |
| Supabase project | `ieuwiinbvbdvjrdqqzlb.supabase.co` | Staging bundle inspection |
| Browser callback | `handle-payment` redirect adapter | Source implementation; it does not mutate payment state or Sheets |
| Payment authority | `razorpay-webhook` | Source implementation; signature, event, provider-state, amount, and currency checks precede reconciliation |

The worktree does not contain a webhook registration URL, Google service-account
credentials, configured Sheet IDs, or live tab values. Consequently, existing
headers, duplicate booking IDs, duplicate lead emails, orphan rows, and the
provider registration cannot be confirmed from this checkout. The read-only
audit command in [sheets-audit-repair.md](sheets-audit-repair.md) accepts an
exported fixture or an existing Sheet ID plus a short-lived read-only token.

The source branch sends each operation to its named Supabase Edge Function; it
does not route requests through a generic service-role Worker. This source
change still needs Framer staging publication and Cloudflare Worker retirement
verification before the legacy gateway can be considered removed end to end.
