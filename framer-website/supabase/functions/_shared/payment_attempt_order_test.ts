import {
    assertEquals,
    assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts"
import {
    ensurePaymentAttemptOrder,
    reactivatePayablePaymentAttempt,
} from "./payment_attempt_order.ts"

const canonicalOrder = {
    id: "order_canonical",
    amount: 120000,
    currency: "INR",
    receipt: "twn_attempt1",
    notes: { booking_id: "booking-1", attempt_id: "attempt-1" },
}

function database(initial: Record<string, unknown>, failFirstUpdate = false) {
    const row = { ...initial }
    let failed = false
    return {
        row,
        from(table: string) {
            assertEquals(table, "payment_attempts")
            let payload: Record<string, unknown> = {}
            const filters: Record<string, unknown> = {}
            let updating = false
            const query = {
                update(value: Record<string, unknown>) {
                    updating = true
                    payload = value
                    return query
                },
                select() {
                    return query
                },
                eq(column: string, value: unknown) {
                    filters[column] = value
                    return query
                },
                in(column: string, value: unknown[]) {
                    filters[column] = value
                    return query
                },
                is(column: string, value: unknown) {
                    filters[column] = value
                    return query
                },
                async maybeSingle() {
                    if (updating) {
                        if (failFirstUpdate && !failed) {
                            failed = true
                            return {
                                data: null,
                                error: { message: "simulated write timeout" },
                            }
                        }
                        const matches = Object.entries(filters).every((
                            [key, value],
                        ) => Array.isArray(value)
                            ? value.includes(row[key])
                            : row[key] === value
                        )
                        if (!matches) return { data: null, error: null }
                        Object.assign(row, payload)
                    }
                    const matches = Object.entries(filters).every((
                        [key, value],
                    ) => Array.isArray(value)
                        ? value.includes(row[key])
                        : row[key] === value
                    )
                    return { data: matches ? { ...row } : null, error: null }
                },
            }
            return query
        },
    }
}

function requestWithOrder(order: Record<string, unknown> | null) {
    const methods: string[] = []
    const request: typeof fetch = async (_input, init) => {
        const method = String((init as any)?.method || "GET").toUpperCase()
        methods.push(method)
        if (method === "POST") {
            return new Response(JSON.stringify(canonicalOrder), { status: 200 })
        }
        return new Response(JSON.stringify({ items: order ? [order] : [] }), {
            status: 200,
        })
    }
    return { request, methods }
}

function attempt(status = "creating", providerOrderId: string | null = null) {
    return {
        id: "attempt-1",
        status,
        provider: "razorpay",
        provider_order_id: providerOrderId,
        amount_minor: 120000,
        currency: "INR",
    }
}

const shared = {
    amount: 1200,
    currency: "INR",
    receipt: "twn_attempt1",
    notes: { booking_id: "booking-1", attempt_id: "attempt-1" },
    credentials: { keyId: "rzp_test_public", keySecret: "unit-test-only" },
}

Deno.test("the successful insert owner creates and persists one canonical order", async () => {
    const supabase = database(attempt())
    const { request, methods } = requestWithOrder(null)

    const result = await ensurePaymentAttemptOrder({
        supabase,
        attempt: attempt(),
        mayCreate: true,
        ...shared,
        request,
    })

    assertEquals(result.order.id, canonicalOrder.id)
    assertEquals(result.attempt.provider_order_id, canonicalOrder.id)
    assertEquals(result.attempt.status, "pending")
    assertEquals(supabase.row.provider_order_id, canonicalOrder.id)
    assertEquals(methods, ["POST"])
})

Deno.test("a replay recovers provider success after persistence failed without another POST", async () => {
    const supabase = database(attempt(), true)
    const first = requestWithOrder(null)
    await assertRejects(
        () =>
            ensurePaymentAttemptOrder({
                supabase,
                attempt: attempt(),
                mayCreate: true,
                ...shared,
                request: first.request,
            }),
        Error,
        "could not be saved",
    )

    const replay = requestWithOrder(canonicalOrder)
    const result = await ensurePaymentAttemptOrder({
        supabase,
        attempt: attempt(),
        mayCreate: false,
        ...shared,
        request: replay.request,
    })

    assertEquals(result.order.id, canonicalOrder.id)
    assertEquals(result.attempt.provider_order_id, canonicalOrder.id)
    assertEquals(first.methods, ["POST"])
    assertEquals(replay.methods, ["GET"])
})

Deno.test("a replay with uncertain creation and no visible provider order fails closed", async () => {
    const supabase = database(attempt())
    const { request, methods } = requestWithOrder(null)

    await assertRejects(
        () =>
            ensurePaymentAttemptOrder({
                supabase,
                attempt: attempt(),
                mayCreate: false,
                ...shared,
                request,
            }),
        Error,
        "still being reconciled",
    )
    assertEquals(methods, ["GET"])
})

Deno.test("concurrent create and replay requests receive the same unique-receipt order", async () => {
    const existing = {
        ...attempt("creating"),
        expires_at: new Date(Date.now() + 60_000).toISOString(),
    }
    const supabase = database(existing)
    let createdOrder: Record<string, unknown> | null = null
    let createCount = 0
    const request: typeof fetch = async (_input, init) => {
        const method = String((init as any)?.method || "GET").toUpperCase()
        if (method === "POST") {
            if (!createdOrder) {
                createCount += 1
                createdOrder = canonicalOrder
                return new Response(JSON.stringify(canonicalOrder), { status: 200 })
            }
            return new Response(JSON.stringify({
                error: { description: "Receipt already exists" },
            }), { status: 400 })
        }
        return new Response(JSON.stringify({ items: createdOrder ? [createdOrder] : [] }), {
            status: 200,
        })
    }
    const params = {
        supabase,
        attempt: existing,
        ...shared,
        request,
    }

    const [replay, owner] = await Promise.all([
        ensurePaymentAttemptOrder({ ...params, mayCreate: false }),
        ensurePaymentAttemptOrder({ ...params, mayCreate: true }),
    ])

    assertEquals(replay.order.id, canonicalOrder.id)
    assertEquals(owner.order.id, canonicalOrder.id)
    assertEquals(createCount, 1)
    assertEquals(supabase.row.provider_order_id, canonicalOrder.id)
})

Deno.test("a persisted order is returned without another provider request", async () => {
    const existing = {
        ...attempt("pending"),
        provider_order_id: canonicalOrder.id,
    }
    const supabase = database(existing)
    const { request, methods } = requestWithOrder(null)

    const result = await ensurePaymentAttemptOrder({
        supabase,
        attempt: existing,
        mayCreate: false,
        ...shared,
        request,
    })

    assertEquals(result.order.id, canonicalOrder.id)
    assertEquals(methods, [])
})

Deno.test("a legacy pending attempt without an order is reconciled, never recreated", async () => {
    const supabase = database(attempt("pending"))
    const { request, methods } = requestWithOrder(null)

    await assertRejects(
        () =>
            ensurePaymentAttemptOrder({
                supabase,
                attempt: attempt("pending"),
                mayCreate: false,
                ...shared,
                request,
            }),
        Error,
        "still being reconciled",
    )
    assertEquals(methods, ["GET"])
})

Deno.test("retry reactivates the same failed attempt and reuses its unpaid provider order", async () => {
    const existing = attempt("failed", canonicalOrder.id)
    const supabase = database(existing)
    const methods: string[] = []
    const request: typeof fetch = async (input, init) => {
        methods.push(String((init as any)?.method || "GET").toUpperCase())
        assertEquals(String(input), "https://api.razorpay.com/v1/orders/order_canonical")
        return new Response(JSON.stringify({
            ...canonicalOrder,
            status: "attempted",
            amount_paid: 0,
            amount_due: 120000,
        }), { status: 200 })
    }

    const resumed = await reactivatePayablePaymentAttempt({
        supabase,
        attempt: existing,
        bookingId: "booking-1",
        amount: 1200,
        currency: "INR",
        credentials: shared.credentials,
        request,
        now: new Date("2026-11-01T00:00:00.000Z"),
    })

    assertEquals(resumed?.provider_order_id, canonicalOrder.id)
    assertEquals(resumed?.status, "pending")
    assertEquals(supabase.row.provider_order_id, canonicalOrder.id)
    assertEquals(supabase.row.expires_at, "2026-11-01T00:30:00.000Z")
    assertEquals(methods, ["GET"])
})

Deno.test("retry does not reactivate a paid order", async () => {
    const existing = attempt("failed", canonicalOrder.id)
    const supabase = database(existing)
    const request: typeof fetch = async () =>
        new Response(JSON.stringify({
            ...canonicalOrder,
            status: "paid",
            amount_paid: 120000,
            amount_due: 0,
        }), { status: 200 })

    const resumed = await reactivatePayablePaymentAttempt({
        supabase,
        attempt: existing,
        bookingId: "booking-1",
        amount: 1200,
        currency: "INR",
        credentials: shared.credentials,
        request,
    })

    assertEquals(resumed, null)
    assertEquals(supabase.row.status, "failed")
})

Deno.test("retry does not overwrite a paid attempt during provider status lookup", async () => {
    const existing = attempt("failed", canonicalOrder.id)
    const supabase = database(existing)
    const request: typeof fetch = async () => {
        supabase.row.status = "paid"
        return new Response(JSON.stringify({
            ...canonicalOrder,
            status: "attempted",
            amount_paid: 0,
            amount_due: 120000,
        }), { status: 200 })
    }

    const resumed = await reactivatePayablePaymentAttempt({
        supabase,
        attempt: existing,
        bookingId: "booking-1",
        amount: 1200,
        currency: "INR",
        credentials: shared.credentials,
        request,
    })

    assertEquals(resumed, null)
    assertEquals(supabase.row.status, "paid")
})
