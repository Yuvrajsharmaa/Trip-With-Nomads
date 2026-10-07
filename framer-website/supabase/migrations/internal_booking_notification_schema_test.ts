import { assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts"

Deno.test("internal booking notification migration is private and retryable", async () => {
  const files = []
  for await (const entry of Deno.readDir(new URL(".", import.meta.url))) {
    if (entry.isFile && entry.name.includes("booking_internal_notification") && entry.name.endsWith(".sql")) {
      files.push(entry.name)
    }
  }
  assertStringIncludes(files.join("\n"), "booking_internal_notification")
  const migration = await Deno.readTextFile(
    new URL(`./${files[0]}`, import.meta.url),
  )
  assertStringIncludes(migration, "create table if not exists public.booking_notification_events")
  assertStringIncludes(migration, "enable row level security")
  assertStringIncludes(migration, "grant all on table public.booking_notification_events to service_role")
  assertStringIncludes(migration, "event_key")
  assertStringIncludes(migration, "email_payload")
})
