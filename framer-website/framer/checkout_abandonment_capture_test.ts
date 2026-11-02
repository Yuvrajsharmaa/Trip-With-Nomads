import {
  assert,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

const source = await Deno.readTextFile(
  new URL("./CheckoutPageOverrides.tsx", import.meta.url),
);
const migration = await Deno.readTextFile(
  new URL(
    "../supabase/migrations/20261102015920_checkout_reminder_queue.sql",
    import.meta.url,
  ),
);

Deno.test("switching apps or tabs does not mark checkout abandoned", () => {
  assertStringIncludes(
    source,
    'window.addEventListener("pagehide", captureAbandonedBooking)',
  );
  assertStringIncludes(
    source,
    'window.addEventListener("beforeunload", captureAbandonedBooking)',
  );
  assert(
    !source.includes(
      'document.addEventListener("visibilitychange", handleVisibilityChange)',
    ),
  );
  assert(!source.includes("const handleVisibilityChange = () =>"));
});

Deno.test("checkout reminders are disclosed and do not require a consent checkbox", () => {
  assert(!source.includes('id="checkout-reminder-opt-in"'));
  assertStringIncludes(
    source,
    "If you leave before paying, we may email up to two checkout reminders: one after 20 minutes and one the next day.",
  );
  assertStringIncludes(source, "Unsubscribe anytime.");
  assertStringIncludes(source, "store?.contactEmail");
  assertStringIncludes(
    source,
    "if (!tripId || !EMAIL_REGEX.test(email)) return false",
  );
  assert(!source.includes("reminder_opt_in"));
  assert(!migration.includes("reminder_opt_in"));
  assertStringIncludes(source, "source: BOOKING_ABANDON_LEAD_SOURCE");
});

Deno.test("abandoned checkout capture does not persist query-string values", () => {
  assertStringIncludes(
    source,
    'page_url: typeof window !== "undefined" ? window.location.origin + window.location.pathname : null',
  );
  assert(
    !source.includes(
      'page_url: typeof window !== "undefined" ? window.location.href : null',
    ),
  );
});
