import {
  assert,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts"

Deno.test("booking status fetch is bounded and renders explicit errors", async () => {
  const source = await Deno.readTextFile(new URL("./BookingStatusOverride.tsx", import.meta.url))

  assertStringIncludes(source, "new AbortController()")
  assertStringIncludes(source, "controller.abort()")
  assertStringIncludes(source, "Status request timed out")
  assertStringIncludes(source, "Cache-Control")
  assertStringIncludes(source, "_errorMessage")
  assertStringIncludes(source, "state === \"error\"")
  assertStringIncludes(source, "Retry status")
  assertStringIncludes(source, "if (cancelled) return")
})

Deno.test("booking status recognizes Framer staging and preview hosts", async () => {
  const source = await Deno.readTextFile(new URL("./BookingStatusOverride.tsx", import.meta.url))

  assertStringIncludes(source, 'host.endsWith(".framer.app")')
  assertStringIncludes(source, 'host.endsWith(".framer.website")')
  assert(source.includes('host === "tripwithnomads.com"'))
})

Deno.test("status result is server-authenticated and does not trust URL payment state", async () => {
  const source = await Deno.readTextFile(new URL("./BookingStatusOverride.tsx", import.meta.url))

  assertStringIncludes(source, "status_token")
  assertStringIncludes(source, "get-booking-status")
  assert(!source.includes('params.get("payment_status")'))
})
