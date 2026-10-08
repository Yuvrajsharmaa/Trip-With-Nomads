import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts"
import { isPhoneOnlyLeadContact } from "./lead_projection.ts"

Deno.test("only completed NTC and itinerary leads may project without email", () => {
    assertEquals(
        isPhoneOnlyLeadContact("booking_invite", { phone: "9812345601" }),
        true,
    )
    assertEquals(
        isPhoneOnlyLeadContact("trip_itinerary_download", { phone: "9812345601" }),
        true,
    )
    assertEquals(
        isPhoneOnlyLeadContact("booking_invite", { phone: "" }),
        false,
    )
    assertEquals(
        isPhoneOnlyLeadContact("trip_page_lead", { phone: "9812345601" }),
        false,
    )
})
