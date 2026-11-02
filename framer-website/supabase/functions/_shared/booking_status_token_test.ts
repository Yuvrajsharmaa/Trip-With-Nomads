import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts"
import {
    issueBookingStatusToken,
    listBookingStatusSecrets,
    verifyBookingStatusToken,
} from "./booking_status_token.ts"

Deno.test("status token verification includes the checkout PAYMENT_STATUS_SECRET fallback", () => {
    const secrets = listBookingStatusSecrets((name) =>
        name === "PAYMENT_STATUS_SECRET" ? "checkout-status-secret" : undefined
    )
    assertEquals(secrets.includes("checkout-status-secret"), true)
})

Deno.test("status token signed by PAYMENT_STATUS_SECRET verifies with the configured candidates", async () => {
    const bookingId = "8c65dd46-2740-4f46-af9b-163512eaf2bb"
    const secret = "checkout-status-secret"
    const { token } = await issueBookingStatusToken(bookingId, secret)
    const secrets = listBookingStatusSecrets((name) =>
        name === "PAYMENT_STATUS_SECRET" ? secret : undefined
    )

    let verified = false
    for (const candidate of secrets) {
        if (await verifyBookingStatusToken(token, bookingId, candidate)) verified = true
    }
    assertEquals(verified, true)
})
