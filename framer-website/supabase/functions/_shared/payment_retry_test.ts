import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts"
import { parseRetryRequest } from "./payment_retry.ts"

Deno.test("retry request requires a signed booking status token", () => {
    assertThrows(
        () => parseRetryRequest({ booking_id: "booking-1", email: "guest@example.com" }),
        Error,
        "Missing status token",
    )
})

Deno.test("retry request normalizes booking identity fields and preserves the token", () => {
    assertEquals(
        parseRetryRequest({
            booking_id: " booking-1 ",
            email: " Guest@Example.COM ",
            status_token: " v1.token ",
        }),
        {
            bookingId: "booking-1",
            email: "guest@example.com",
            statusToken: "v1.token",
        },
    )
})
