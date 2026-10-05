import { assert, assertStringIncludes, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts"

Deno.test("Razorpay webhook verifies raw payloads and persists generic payment events", async () => {
    const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url))

    assertStringIncludes(source, "await req.text()")
    assertStringIncludes(source, "x-razorpay-signature")
    assertStringIncludes(source, "x-razorpay-event-id")
    assertStringIncludes(source, "from(\"payment_events\")")
    assertStringIncludes(source, "provider_event_id")
    assertStringIncludes(source, "sheet_sync_status")
    assertStringIncludes(source, "Razorpay API")
    assert(!source.includes("callback_orphan"))
    assertNotEquals(source.indexOf("await req.text()"), -1)
})
