import {
  assert,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

Deno.test("checkout reminder migration is private, bounded, retryable, and suppresses a successful booking", async () => {
  const migration = await Deno.readTextFile(
    new URL("./20261102015920_checkout_reminder_queue.sql", import.meta.url),
  );
  const worker = await Deno.readTextFile(
    new URL("../functions/checkout-reminders/index.ts", import.meta.url),
  );

  assertStringIncludes(migration, "create extension if not exists pg_cron");
  assertStringIncludes(migration, "create extension if not exists pg_net");
  assertStringIncludes(
    migration,
    "create table if not exists public.checkout_reminder_sequences",
  );
  assertStringIncludes(migration, "normalized_email text not null unique");
  assertStringIncludes(migration, "enable row level security");
  assertStringIncludes(
    migration,
    "revoke all on public.checkout_reminder_sequences from public, anon, authenticated",
  );
  assertStringIncludes(migration, "booking_abandoned");
  assertStringIncludes(migration, "interval '20 minutes'");
  assert(!migration.includes("reminder_opt_in"));
  assertStringIncludes(migration, "interval '30 days'");
  const enqueue = migration.slice(
    migration.indexOf(
      "create or replace function public.enqueue_checkout_reminder()",
    ),
    migration.indexOf(
      "drop trigger if exists enqueue_checkout_reminder_after_lead_capture",
    ),
  );
  assertStringIncludes(
    enqueue,
    "exception when others then",
    "reminder queue failures must not roll back a captured lead",
  );
  assertStringIncludes(
    enqueue,
    "raise warning 'checkout reminder enqueue failed with sqlstate %', sqlstate",
    "queue errors should be observable without logging customer data",
  );
  assertStringIncludes(migration, "sent_count between 0 and 2");
  assertStringIncludes(migration, "attempt_count between 0 and 3");
  assertStringIncludes(migration, "for update skip locked");
  assertStringIncludes(migration, "attempt_count < 3");
  assertStringIncludes(migration, "status = 'failed'");
  assertStringIncludes(migration, "and attempt_count >= 3;");
  assertStringIncludes(
    migration,
    "lower(trim(booking.email)) = lower(trim(target_email))",
  );
  assertStringIncludes(migration, "booking.created_at >= abandoned_at");
  assertStringIncludes(
    migration,
    "create or replace function public.checkout_reminder_has_booking(",
  );
  const bookingSuppression = migration.slice(
    migration.indexOf(
      "create or replace function public.checkout_reminder_has_booking",
    ),
    migration.indexOf(
      "$function$;",
      migration.indexOf(
        "create or replace function public.checkout_reminder_has_booking",
      ),
    ),
  );
  assertStringIncludes(bookingSuppression, "select exists");
  assertStringIncludes(
    bookingSuppression,
    "booking.created_at >= abandoned_at",
  );
  assertStringIncludes(
    bookingSuppression,
    "booking.last_payment_event_at >= abandoned_at",
    "a payment that completes an existing booking must suppress later reminders",
  );
  assertStringIncludes(
    bookingSuppression,
    "lower(coalesce(booking.payment_status, '')) = 'paid'",
  );
  assert(
    !bookingSuppression.includes("target_trip_id"),
    "a successful booking for another trip should also stop reminders",
  );
  assert(
    bookingSuppression.includes("payment_status"),
    "only a verified successful payment should suppress reminders",
  );
  assert(
    !bookingSuppression.includes("paid_amount"),
    "a non-zero attempt alone must not suppress a reminder",
  );
  const bookingCheckCall = worker.slice(
    worker.indexOf('"checkout_reminder_has_booking"'),
    worker.indexOf(
      ");",
      worker.indexOf('"checkout_reminder_has_booking"'),
    ),
  );
  assertStringIncludes(
    bookingCheckCall,
    "target_email: sequence.normalized_email",
  );
  assertStringIncludes(bookingCheckCall, "abandoned_at: submission.created_at");
  assert(!bookingCheckCall.includes("target_trip_id"));
  assertStringIncludes(
    migration,
    "grant all on public.checkout_reminder_sequences to service_role",
  );
  assertStringIncludes(migration, "twn-checkout-reminders");
  assertStringIncludes(migration, "checkout-reminders");
  assert(
    !migration.includes("alter table public.bookings"),
    "website booking schema must remain unchanged",
  );
});
