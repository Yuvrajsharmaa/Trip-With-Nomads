import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts"
import { isPhoneOnlyLeadContact, masterLeadMatchKeys } from "./lead_projection.ts"

Deno.test("email is the sole matching key when a lead has an email", () => {
    assertEquals(
        masterLeadMatchKeys([
            "9 Oct 2026",
            "9 Oct 2026",
            "First Contact",
            " FIRST@example.com ",
            "+91 0000000000",
            "",
            "Vietnam",
            "",
            "Trip page form",
            "Submitted",
            "",
        ]),
        [{ column: "Email", value: "first@example.com" }],
    )

    assertEquals(
        masterLeadMatchKeys([
            "9 Oct 2026",
            "9 Oct 2026",
            "Second Contact",
            "second@example.com",
            "+91 0000000000",
            "",
            "Japan",
            "",
            "NTC invite",
            "Submitted",
            "",
        ]),
        [{ column: "Email", value: "second@example.com" }],
    )
})

Deno.test("email-less contacts do not match another contact by phone", () => {
    assertEquals(
        masterLeadMatchKeys([
            "9 Oct 2026",
            "9 Oct 2026",
            "Phone Only Contact",
            "",
            "+91 0000000000",
            "",
            "Vietnam",
            "Downloaded itinerary",
            "Itinerary download",
            "Submitted",
            "",
        ]),
        [],
    )
})

Deno.test("phone-only lead routes remain projectable without email", () => {
    assertEquals(
        isPhoneOnlyLeadContact("booking_invite", { phone: "9812345601" }),
        true,
    )
    assertEquals(
        isPhoneOnlyLeadContact("general_lead", { phone: "9812345601" }),
        true,
    )
    assertEquals(
        isPhoneOnlyLeadContact("waitlist_popup", { phone: "9812345601" }),
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
    assertEquals(
        isPhoneOnlyLeadContact("general_lead", { phone: "" }),
        false,
    )
    assertEquals(
        isPhoneOnlyLeadContact("waitlist_popup", { phone: "" }),
        false,
    )
})
