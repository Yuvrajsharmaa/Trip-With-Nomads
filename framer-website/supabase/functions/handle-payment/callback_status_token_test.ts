import {
    assert,
    assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts"
import {
    issueBookingStatusToken,
    verifyBookingStatusToken,
} from "../_shared/booking_status_token.ts"
import { resolveCallbackStatusToken } from "./callback_status_token.ts"

const bookingId = "8c65dd46-2740-4f46-af9b-163512eaf2bb"
const otherBookingId = "993b9963-1549-4fa8-819e-a09352d4bcef"
const orderId = "order_test123456789"
const paymentId = "pay_test987654321"
const keySecret = "razorpay-test-secret"
const statusSecret = "booking-status-test-secret"
const credentials = { keyId: "rzp_test_key", keySecret }

async function checkoutSignature(secret = keySecret): Promise<string> {
    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
    )
    const signature = new Uint8Array(
        await crypto.subtle.sign(
            "HMAC",
            key,
            new TextEncoder().encode(`${orderId}|${paymentId}`),
        ),
    )
    return Array.from(signature).map((byte) =>
        byte.toString(16).padStart(2, "0")
    )
        .join("")
}

function callbackParams(overrides: Record<string, unknown> = {}) {
    return {
        bookingId,
        suppliedToken: "",
        statusSecrets: [statusSecret],
        statusSecret,
        credentials,
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: "",
        ...overrides,
    }
}

Deno.test("refreshes a missing status token only for a signed Razorpay order linked to the booking", async () => {
    const signature = await checkoutSignature()
    let calls = 0
    const request: typeof fetch = async (input, init) => {
        calls += 1
        const url = String(input)
        if (url.endsWith(`/orders/${orderId}/payments`)) {
            return new Response(
                JSON.stringify({
                    count: 1,
                    items: [{
                        id: paymentId,
                        order_id: orderId,
                        created_at: Math.floor(Date.now() / 1000),
                    }],
                }),
                { status: 200 },
            )
        }
        assertEquals(url, `https://api.razorpay.com/v1/orders/${orderId}`)
        return new Response(
            JSON.stringify({ id: orderId, notes: { booking_id: bookingId } }),
            { status: 200 },
        )
    }

    const token = await resolveCallbackStatusToken({
        ...callbackParams({ razorpaySignature: signature }),
        request,
    })

    assert(token.startsWith("v1."))
    assertEquals(
        await verifyBookingStatusToken(token, bookingId, statusSecret),
        true,
    )
    assertEquals(calls, 2)
})

Deno.test("replaces an expired or invalid supplied token only after Razorpay callback verification", async () => {
    const signature = await checkoutSignature()
    const request: typeof fetch = async (input) => {
        if (String(input).endsWith(`/orders/${orderId}/payments`)) {
            return new Response(
                JSON.stringify({
                    count: 1,
                    items: [{
                        id: paymentId,
                        order_id: orderId,
                        created_at: Math.floor(Date.now() / 1000),
                    }],
                }),
                { status: 200 },
            )
        }
        return new Response(
            JSON.stringify({ id: orderId, notes: { booking_id: bookingId } }),
            { status: 200 },
        )
    }

    const token = await resolveCallbackStatusToken({
        ...callbackParams({
            suppliedToken: "v1.expired.bad-signature",
            razorpaySignature: signature,
        }),
        request,
    })

    assert(token !== "v1.expired.bad-signature")
    assertEquals(
        await verifyBookingStatusToken(token, bookingId, statusSecret),
        true,
    )
})

Deno.test("passes through a valid supplied token without contacting Razorpay", async () => {
    const supplied = await issueBookingStatusToken(bookingId, statusSecret)
    let calls = 0
    const token = await resolveCallbackStatusToken({
        ...callbackParams({
            suppliedToken: supplied.token,
            credentials: { keyId: "", keySecret: "" },
        }),
        request: async () => {
            calls += 1
            throw new Error("must not fetch")
        },
    })

    assertEquals(token, supplied.token)
    assertEquals(calls, 0)
})

Deno.test("does not mint from a booking UUID without a valid Razorpay signature", async () => {
    let calls = 0
    const token = await resolveCallbackStatusToken({
        ...callbackParams({ razorpaySignature: "" }),
        request: async () => {
            calls += 1
            throw new Error("must not fetch")
        },
    })

    assertEquals(token, "")
    assertEquals(calls, 0)
})

Deno.test("does not issue a token when the signed Razorpay order belongs to another booking", async () => {
    const signature = await checkoutSignature()
    const token = await resolveCallbackStatusToken({
        ...callbackParams({ razorpaySignature: signature }),
        request: async () =>
            new Response(
                JSON.stringify({
                    id: orderId,
                    notes: { booking_id: otherBookingId },
                }),
                { status: 200 },
            ),
    })

    assertEquals(token, "")
})

Deno.test("does not refresh a status token from an old signed payment callback", async () => {
    const signature = await checkoutSignature()
    const request: typeof fetch = async (input) => {
        if (String(input).endsWith(`/orders/${orderId}/payments`)) {
            return new Response(
                JSON.stringify({
                    count: 1,
                    items: [{
                        id: paymentId,
                        order_id: orderId,
                        created_at: 1,
                    }],
                }),
                { status: 200 },
            )
        }
        return new Response(
            JSON.stringify({ id: orderId, notes: { booking_id: bookingId } }),
            { status: 200 },
        )
    }

    const token = await resolveCallbackStatusToken({
        ...callbackParams({ razorpaySignature: signature }),
        request,
    })

    assertEquals(token, "")
})

Deno.test("does not refresh when Razorpay's payment does not match the signed callback pair", async () => {
    const signature = await checkoutSignature()
    for (
        const payment of [
            {
                id: "pay_different123",
                order_id: orderId,
                created_at: Math.floor(Date.now() / 1000),
            },
            {
                id: paymentId,
                order_id: "order_different123",
                created_at: Math.floor(Date.now() / 1000),
            },
        ]
    ) {
        const request: typeof fetch = async (input) => {
            if (String(input).endsWith(`/orders/${orderId}/payments`)) {
                return new Response(
                    JSON.stringify({ count: 1, items: [payment] }),
                    { status: 200 },
                )
            }
            return new Response(
                JSON.stringify({
                    id: orderId,
                    notes: { booking_id: bookingId },
                }),
                { status: 200 },
            )
        }
        const token = await resolveCallbackStatusToken({
            ...callbackParams({ razorpaySignature: signature }),
            request,
        })
        assertEquals(token, "")
    }
})

Deno.test("does not fetch or issue a token for a malformed checkout signature", async () => {
    let calls = 0
    const token = await resolveCallbackStatusToken({
        ...callbackParams({ razorpaySignature: "not-a-signature" }),
        request: async () => {
            calls += 1
            throw new Error("must not fetch")
        },
    })

    assertEquals(token, "")
    assertEquals(calls, 0)
})

Deno.test("aborts a Razorpay order lookup that exceeds the callback timeout", async () => {
    const signature = await checkoutSignature()
    let signal: AbortSignal | undefined
    let rejected = false
    try {
        await resolveCallbackStatusToken({
            ...callbackParams({ razorpaySignature: signature }),
            request: (_input, init) =>
                new Promise((_resolve, reject) => {
                    signal = Reflect.get(init ?? {}, "signal") as
                        | AbortSignal
                        | undefined
                    signal?.addEventListener("abort", () =>
                        reject(signal?.reason), {
                        once: true,
                    })
                }),
        })
    } catch {
        rejected = true
    }

    assertEquals(rejected, true)
    assertEquals(signal?.aborted, true)
})
