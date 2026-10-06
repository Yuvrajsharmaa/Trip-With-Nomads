import {
    buildPaymentAttemptInsert,
    canStartPaymentRetry,
    fingerprintBookingRequest,
    isCompatibleIdempotentReplay,
    isStalePaymentAttempt,
    nextPaymentAttemptNumber,
    normalizeIdempotencyKey,
} from "./payment_idempotency.ts"
import { assert, assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts"

Deno.test("normalizes UUID idempotency keys and rejects unsafe keys", async () => {
    const key = "  550e8400-e29b-41d4-a716-446655440000  "
    assertEquals(normalizeIdempotencyKey(key, "checkout_request_id"), key.trim())
    assertThrows(
        () => normalizeIdempotencyKey("not-a-uuid", "checkout_request_id"),
        Error,
        "valid checkout_request_id",
    )
})

Deno.test("fingerprint is stable across object key order and changes with booking data", async () => {
    const left = await fingerprintBookingRequest({
        trip_id: "trip-1",
        departure_date: "2026-11-01",
        travellers: [{ id: 1, name: "Guest", sharing: "Double" }],
        payment_mode: "full",
    })
    const right = await fingerprintBookingRequest({
        payment_mode: "full",
        travellers: [{ sharing: "Double", name: "Guest", id: 1 }],
        departure_date: "2026-11-01",
        trip_id: "trip-1",
    })
    const changed = await fingerprintBookingRequest({
        trip_id: "trip-1",
        departure_date: "2026-11-02",
        travellers: [{ id: 1, name: "Guest", sharing: "Double" }],
        payment_mode: "full",
    })

    assertEquals(left, right)
    assert(left !== changed)
})

Deno.test("retry is blocked while pending or paid and allowed after failure or expiry", () => {
    assertEquals(canStartPaymentRetry({ status: "pending" }), false)
    assertEquals(canStartPaymentRetry({ status: "paid" }), false)
    assertEquals(canStartPaymentRetry({ status: "failed" }), true)
    assertEquals(
        canStartPaymentRetry({ status: "pending", expiresAt: "2026-01-01T00:00:00.000Z" }, new Date("2026-01-02T00:00:00.000Z")),
        false,
    )
    assertEquals(canStartPaymentRetry({ status: "expired" }), true)
})

Deno.test("stale pending attempts become explicitly retryable only after expiry", () => {
    const now = new Date("2026-10-06T12:00:00.000Z")
    assertEquals(
        isStalePaymentAttempt({ status: "pending", expiresAt: "2026-10-06T11:59:59.000Z" }, now),
        true,
    )
    assertEquals(
        isStalePaymentAttempt({ status: "pending", expiresAt: "2026-10-06T12:00:01.000Z" }, now),
        false,
    )
    assertEquals(isStalePaymentAttempt({ status: "failed", expiresAt: "2026-10-06T11:00:00.000Z" }, now), false)
})

Deno.test("next attempt number is monotonic", () => {
    assertEquals(nextPaymentAttemptNumber([]), 1)
    assertEquals(nextPaymentAttemptNumber([{ attempt_no: 1 }, { attempt_no: 3 }, { attempt_no: 2 }]), 4)
})

Deno.test("payment attempt rows use minor units and provider-neutral fields", () => {
    assertEquals(
        buildPaymentAttemptInsert({
            bookingId: "booking-1",
            attemptNo: 2,
            idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
            provider: "PayU",
            amount: 1250.5,
            currency: "inr",
            providerOrderId: "order-2",
            status: "pending",
        }),
        {
            booking_id: "booking-1",
            attempt_no: 2,
            idempotency_key: "550e8400-e29b-41d4-a716-446655440000",
            provider: "payu",
            amount_minor: 125050,
            currency: "INR",
            provider_order_id: "order-2",
            provider_payment_id: null,
            provider_transaction_id: null,
            status: "pending",
        },
    )
})

Deno.test("idempotent replay requires the original request fingerprint", () => {
    assertEquals(isCompatibleIdempotentReplay("same", "same"), true)
    assertEquals(isCompatibleIdempotentReplay("same", "changed"), false)
    assertEquals(isCompatibleIdempotentReplay(null, "same"), false)
})
