import {
    assertEquals,
    assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts"
import * as razorpay from "./razorpay.ts"
import {
    canReuseRazorpayOrderForRetry,
    findRazorpayOrderByReceipt,
    fetchRazorpayOrderById,
} from "./razorpay.ts"

const params = {
    amount: 1200,
    currency: "INR",
    receipt: "twn_0123456789abcdef0123456789abcdef",
    notes: { booking_id: "booking-1", attempt_id: "attempt-1" },
}
const credentials = { keyId: "rzp_test_public", keySecret: "unit-test-only" }

function jsonResponse(payload: unknown, status = 200): Response {
    return new Response(JSON.stringify(payload), {
        status,
        headers: { "Content-Type": "application/json" },
    })
}

function order(overrides: Record<string, unknown> = {}) {
    return {
        id: "order_canonical",
        amount: 120000,
        currency: "INR",
        receipt: params.receipt,
        notes: params.notes,
        ...overrides,
    }
}

Deno.test("receipt reconciliation reads the one matching order without creating another", async () => {
    const requests: string[] = []
    const request: typeof fetch = async (input, init) => {
        const url = new URL(String(input))
        const method = String((init as any)?.method || "GET").toUpperCase()
        requests.push(`${method} ${url.pathname}`)
        assertEquals(url.searchParams.get("receipt"), params.receipt)
        return jsonResponse({ items: [order()] })
    }
    const result = await findRazorpayOrderByReceipt(
        params,
        credentials,
        request,
    )

    assertEquals(result?.id, "order_canonical")
    assertEquals(requests, ["GET /v1/orders"])
})

Deno.test("a provider timeout after creating an order recovers it by stable receipt", async () => {
    const canonicalOrder = order()
    const methods: string[] = []
    const request: typeof fetch = async (_input, init) => {
        const method = String((init as any)?.method || "GET").toUpperCase()
        methods.push(method)
        if (method === "POST") throw new TypeError("simulated response timeout")
        return jsonResponse({ items: [canonicalOrder] })
    }
    const result = await razorpay.createRazorpayOrder(
        params,
        credentials,
        request,
    )

    assertEquals(result?.id, "order_canonical")
    assertEquals(methods, ["POST", "GET"])
})

Deno.test("receipt recovery rejects an order with a different amount or booking notes", async () => {
    const mismatches = [
        order({ amount: 90000 }),
        order({ currency: "USD" }),
        order({
            notes: { booking_id: "another-booking", attempt_id: "attempt-1" },
        }),
    ]

    for (const mismatch of mismatches) {
        const request: typeof fetch = async (_input, init) => {
            if (
                String((init as any)?.method || "GET").toUpperCase() === "POST"
            ) {
                return jsonResponse({
                    error: { description: "Receipt already exists" },
                }, 400)
            }
            return jsonResponse({ items: [mismatch] })
        }
        await assertRejects(
            () => razorpay.createRazorpayOrder(params, credentials, request),
            Error,
            "does not match",
        )
    }
})

Deno.test("successful order creation does not make a recovery request", async () => {
    const methods: string[] = []
    const request: typeof fetch = async (_input, init) => {
        const method = String((init as any)?.method || "GET").toUpperCase()
        methods.push(method)
        return jsonResponse(order({ id: "order_first_response" }))
    }

    const result = await razorpay.createRazorpayOrder(
        params,
        credentials,
        request,
    )

    assertEquals(result.id, "order_first_response")
    assertEquals(methods, ["POST"])
})

Deno.test("missing recovered order preserves the original provider error", async () => {
    const request: typeof fetch = async (_input, init) => {
        if (String((init as any)?.method || "GET").toUpperCase() === "POST") {
            return jsonResponse({
                error: { description: "Receipt already exists" },
            }, 400)
        }
        return jsonResponse({ items: [] })
    }

    await assertRejects(
        () => razorpay.createRazorpayOrder(params, credentials, request),
        Error,
        "Receipt already exists",
    )
})

Deno.test("ambiguous receipt recovery fails closed", async () => {
    const request: typeof fetch = async (_input, init) => {
        if (String((init as any)?.method || "GET").toUpperCase() === "POST") {
            return jsonResponse({
                error: { description: "Receipt already exists" },
            }, 400)
        }
        return jsonResponse({
            items: [order(), order({ id: "order_duplicate" })],
        })
    }

    await assertRejects(
        () => razorpay.createRazorpayOrder(params, credentials, request),
        Error,
        "ambiguous",
    )
})

Deno.test("retry status lookup fetches the stored order without creating another", async () => {
    const methods: string[] = []
    const request: typeof fetch = async (input, init) => {
        methods.push(String((init as any)?.method || "GET").toUpperCase())
        assertEquals(String(input), "https://api.razorpay.com/v1/orders/order_canonical")
        return jsonResponse(order({ status: "attempted", amount_due: 120000, amount_paid: 0 }))
    }

    const result = await fetchRazorpayOrderById("order_canonical", credentials, request)

    assertEquals(result.id, "order_canonical")
    assertEquals(methods, ["GET"])
})

Deno.test("retry reuses only an unpaid matching created or attempted order", () => {
    for (const status of ["created", "attempted"]) {
        assertEquals(
            canReuseRazorpayOrderForRetry(order({
                status,
                amount_due: 120000,
                amount_paid: 0,
            }), params),
            true,
        )
    }

    for (const changed of [
        { status: "paid", amount_due: 0, amount_paid: 120000 },
        { status: "attempted", amount_due: 60000, amount_paid: 60000 },
        { status: "attempted", amount_due: 90000, amount_paid: 0 },
        { status: "attempted", amount_due: 120000, amount_paid: 0, currency: "USD" },
        { status: "attempted", amount_due: 120000, amount_paid: 0, notes: { booking_id: "other" } },
    ]) {
        assertEquals(canReuseRazorpayOrderForRetry(order(changed), params), false)
    }
})
