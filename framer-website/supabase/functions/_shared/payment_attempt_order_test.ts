import {
    assertEquals,
    assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts"
import {
    ensurePaymentAttemptOrder,
    getRazorpayFailedPaymentIdsForRetry,
    markPaymentAttemptOrderCreating,
    recoverPaymentAttemptForRetry,
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
                        return { data: { ...row }, error: null }
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
        idempotency_key: "old-request-id",
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

Deno.test("a fresh reservation receives a short order-creation lease", async () => {
    const pending = { ...attempt("pending"), expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString() }
    const supabase = database(pending)
    const before = Date.now()

    const creating = await markPaymentAttemptOrderCreating(supabase, pending)

    const lease = Date.parse(String(creating.expires_at))
    assertEquals(creating.status, "creating")
    assertEquals(lease >= before + 119_000 && lease <= before + 121_000, true)
})

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

Deno.test("an active creating replay reconciles an existing order without another POST", async () => {
    const active = {
        ...attempt("creating"),
        expires_at: new Date(Date.now() + 60_000).toISOString(),
    }
    const supabase = database(active)
    const { request, methods } = requestWithOrder(canonicalOrder)

    const result = await ensurePaymentAttemptOrder({
        supabase,
        attempt: active,
        mayCreate: false,
        ...shared,
        request,
    })

    assertEquals(result.order.id, canonicalOrder.id)
    assertEquals(result.attempt.provider_order_id, canonicalOrder.id)
    assertEquals(methods, ["GET"])
})

Deno.test("an expired creating attempt reclaims the same receipt after reconciliation confirms absence", async () => {
    const stale = {
        ...attempt("creating"),
        expires_at: new Date(Date.now() - 60_000).toISOString(),
    }
    const supabase = database(stale)
    const { request, methods } = requestWithOrder(null)
    const before = Date.now()

    const result = await ensurePaymentAttemptOrder({
        supabase,
        attempt: stale,
        mayCreate: false,
        ...shared,
        request,
    })
    const after = Date.now()

    assertEquals(result.order.id, canonicalOrder.id)
    assertEquals(result.attempt.id, stale.id)
    assertEquals(result.attempt.provider_order_id, canonicalOrder.id)
    const recoveredExpiry = Date.parse(String(supabase.row.expires_at))
    assertEquals(recoveredExpiry >= before + 30 * 60 * 1000, true)
    assertEquals(recoveredExpiry <= after + 30 * 60 * 1000, true)
    assertEquals(methods, ["GET", "POST"])
})

Deno.test("retry recovers an expired order creation and returns it under the new retry identity", async () => {
    const stale = {
        ...attempt("creating"),
        expires_at: new Date(Date.now() - 60_000).toISOString(),
    }
    const supabase = database(stale)
    const methods: string[] = []
    const recoveredOrder = {
        ...canonicalOrder,
        status: "created",
        attempts: 0,
        amount_paid: 0,
        amount_due: 120000,
    }
    const request: typeof fetch = (input, init) => {
        const method = String((init as globalThis.RequestInit | undefined)?.method || "GET").toUpperCase()
        methods.push(method)
        const url = new URL(String(input))
        const body = method === "POST" || url.pathname.endsWith("/orders/order_canonical")
            ? recoveredOrder
            : { items: [] }
        return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))
    }

    const result = await recoverPaymentAttemptForRetry({
        supabase,
        attempt: stale,
        bookingId: "booking-1",
        amount: 1200,
        currency: "INR",
        credentials: shared.credentials,
        idempotencyKey: "retry-request-id",
        request,
    })

    assertEquals(result?.provider_order_id, canonicalOrder.id)
    assertEquals(result?.status, "pending")
    assertEquals(result?.idempotency_key, "retry-request-id")
    assertEquals(supabase.row.idempotency_key, "retry-request-id")
    assertEquals(methods, ["GET", "POST", "GET"])
})

Deno.test("retry does not recover an old order when the booking amount or currency has changed", async () => {
    const stale = {
        ...attempt("creating"),
        expires_at: new Date(Date.now() - 60_000).toISOString(),
    }
    const supabase = database(stale)
    let requests = 0
    const request: typeof fetch = () => {
        requests += 1
        return Promise.resolve(new Response(JSON.stringify({ items: [] }), { status: 200 }))
    }

    const changedAmount = await recoverPaymentAttemptForRetry({
        supabase,
        attempt: stale,
        bookingId: "booking-1",
        amount: 1400,
        currency: "INR",
        credentials: shared.credentials,
        idempotencyKey: "retry-request-id",
        request,
    })
    const changedCurrency = await recoverPaymentAttemptForRetry({
        supabase,
        attempt: stale,
        bookingId: "booking-1",
        amount: 1200,
        currency: "USD",
        credentials: shared.credentials,
        idempotencyKey: "retry-request-id",
        request,
    })

    assertEquals(changedAmount, null)
    assertEquals(changedCurrency, null)
    assertEquals(requests, 0)
    assertEquals(supabase.row.provider_order_id, null)
})

Deno.test("concurrent replays cannot both reclaim one expired creating attempt", async () => {
    const stale = {
        ...attempt("creating"),
        expires_at: new Date(Date.now() - 60_000).toISOString(),
    }
    const supabase = database(stale)
    let gets = 0
    let posts = 0
    let releaseGets!: () => void
    const bothGets = new Promise<void>((resolve) => releaseGets = resolve)
    const request: typeof fetch = async (_input, init) => {
        const method = String((init as globalThis.RequestInit | undefined)?.method || "GET").toUpperCase()
        if (method === "GET") {
            gets += 1
            if (gets === 2) releaseGets()
            await bothGets
            return new Response(JSON.stringify({ items: [] }), { status: 200 })
        }
        posts += 1
        return new Response(JSON.stringify(canonicalOrder), { status: 200 })
    }
    const params = {
        supabase,
        attempt: stale,
        mayCreate: false,
        ...shared,
        request,
    }

    const outcomes = await Promise.allSettled([
        ensurePaymentAttemptOrder(params),
        ensurePaymentAttemptOrder(params),
    ])

    assertEquals(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1)
    assertEquals(outcomes.filter((outcome) => outcome.status === "rejected").length, 1)
    assertEquals(posts, 1)
    assertEquals(supabase.row.provider_order_id, canonicalOrder.id)
})

Deno.test("an in-flight create lets its replay wait without creating a second order", async () => {
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

    const outcomes = await Promise.allSettled([
        ensurePaymentAttemptOrder({ ...params, mayCreate: false }),
        ensurePaymentAttemptOrder({ ...params, mayCreate: true }),
    ])

    assertEquals(outcomes[0].status, "rejected")
    assertEquals(outcomes[1].status, "fulfilled")
    if (outcomes[0].status === "rejected") {
        assertEquals(outcomes[0].reason.code, "PAYMENT_ORDER_IN_PROGRESS")
    }
    if (outcomes[1].status === "fulfilled") {
        assertEquals(outcomes[1].value.order.id, canonicalOrder.id)
    }
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

Deno.test("a stale pending attempt without an order is recovered by receipt before a replacement is created", async () => {
    const stale = {
        ...attempt("pending"),
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
    }
    const supabase = database(stale)
    const { request, methods } = requestWithOrder(null)

    const result = await ensurePaymentAttemptOrder({
        supabase,
        attempt: stale,
        mayCreate: false,
        ...shared,
        request,
    })

    assertEquals(result.order.id, canonicalOrder.id)
    assertEquals(result.attempt.status, "pending")
    assertEquals(result.attempt.provider_order_id, canonicalOrder.id)
    assertEquals(Date.parse(String(result.attempt.expires_at)) > Date.now() + 29 * 60 * 1000, true)
    assertEquals(methods, ["GET", "POST"])
})

Deno.test("an expired attempt without an order can be reused after receipt reconciliation", async () => {
    const expired = { ...attempt("expired"), expires_at: new Date(Date.now() - 60_000).toISOString() }
    const supabase = database(expired)
    const methods: string[] = []
    const request: typeof fetch = async (input, init) => {
        const method = String((init as any)?.method || "GET").toUpperCase()
        methods.push(method)
        const url = new URL(String(input))
        const data = method === "POST"
            ? canonicalOrder
            : url.pathname.endsWith("/orders/order_canonical")
                ? { ...canonicalOrder, status: "created", attempts: 0, amount_paid: 0, amount_due: 120000 }
                : { items: [] }
        return new Response(JSON.stringify(data), { status: 200 })
    }

    const result = await recoverPaymentAttemptForRetry({
        supabase,
        attempt: expired,
        bookingId: "booking-1",
        amount: 1200,
        currency: "INR",
        credentials: shared.credentials,
        idempotencyKey: "fresh-retry-id",
        request,
    })

    assertEquals(result?.status, "pending")
    assertEquals(result?.provider_order_id, canonicalOrder.id)
    assertEquals(result?.idempotency_key, "fresh-retry-id")
    assertEquals(methods, ["GET", "POST", "GET"])
})

Deno.test("failed and expired attempts attach verified receipt matches without losing terminal status", async () => {
    const recoveredOrder = {
        ...canonicalOrder,
        status: "created",
        attempts: 0,
        amount_paid: 0,
        amount_due: 120000,
    }

    for (const status of ["failed", "expired"]) {
        const terminalAttempt = attempt(status)
        const supabase = database(terminalAttempt)
        const methods: string[] = []
        const request: typeof fetch = async (input, init) => {
            methods.push(String((init as any)?.method || "GET").toUpperCase())
            const url = new URL(String(input))
            const data = url.searchParams.has("receipt")
                ? { items: [recoveredOrder] }
                : recoveredOrder
            return new Response(JSON.stringify(data), { status: 200 })
        }

        const result = await recoverPaymentAttemptForRetry({
            supabase,
            attempt: terminalAttempt,
            bookingId: "booking-1",
            amount: 1200,
            currency: "INR",
            credentials: shared.credentials,
            idempotencyKey: "fresh-retry-id",
            request,
        })

        assertEquals(result?.status, "pending")
        assertEquals(result?.provider_order_id, canonicalOrder.id)
        assertEquals(result?.idempotency_key, "fresh-retry-id")
        assertEquals(methods, ["GET", "GET"])
    }
})

Deno.test("a receipt-recovered order with an unresolved payment leaves the attempt terminal", async () => {
    const failed = attempt("failed")
    const supabase = database(failed)
    const unresolvedOrder = {
        ...canonicalOrder,
        status: "attempted",
        attempts: 1,
        amount_paid: 0,
        amount_due: 120000,
    }
    const request: typeof fetch = async (input) => {
        const url = new URL(String(input))
        const data = url.searchParams.has("receipt")
            ? { items: [unresolvedOrder] }
            : url.pathname.endsWith("/payments")
                ? { count: 1, items: [{ id: "pay_pending", order_id: canonicalOrder.id, status: "authorized" }] }
                : unresolvedOrder
        return new Response(JSON.stringify(data), { status: 200 })
    }

    const result = await recoverPaymentAttemptForRetry({
        supabase,
        attempt: failed,
        bookingId: "booking-1",
        amount: 1200,
        currency: "INR",
        credentials: shared.credentials,
        idempotencyKey: "fresh-retry-id",
        request,
    })

    assertEquals(result, null)
    assertEquals(supabase.row.status, "failed")
    assertEquals(supabase.row.provider_order_id, canonicalOrder.id)
})

Deno.test("retry reactivates the same failed attempt and reuses its unpaid provider order", async () => {
    const existing = attempt("failed", canonicalOrder.id)
    const supabase = database(existing)
    const methods: string[] = []
    const request: typeof fetch = async (input, init) => {
        methods.push(String((init as any)?.method || "GET").toUpperCase())
        const url = new URL(String(input))
        if (url.pathname.endsWith("/payments")) {
            return new Response(JSON.stringify({
                count: 1,
                items: [{ id: "pay_failed", order_id: canonicalOrder.id, status: "failed" }],
            }), { status: 200 })
        }
        assertEquals(url.pathname, "/v1/orders/order_canonical")
        return new Response(JSON.stringify({
            ...canonicalOrder,
            status: "attempted",
            attempts: 1,
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
    assertEquals(supabase.row.superseded_payment_ids, ["pay_failed"])
    assertEquals(supabase.row.expires_at, "2026-11-01T00:30:00.000Z")
    assertEquals(methods, ["GET", "GET"])
})

Deno.test("retry does not reactivate an attempt changed during provider verification", async () => {
    const existing = {
        ...attempt("failed", canonicalOrder.id),
        updated_at: "2026-11-01T00:00:00.000Z",
    }
    const supabase = database(existing)
    const request: typeof fetch = async (input) => {
        const url = new URL(String(input))
        if (url.pathname.endsWith("/payments")) {
            supabase.row.updated_at = "2026-11-01T00:01:00.000Z"
            return new Response(JSON.stringify({
                count: 1,
                items: [{ id: "pay_failed", order_id: canonicalOrder.id, status: "failed" }],
            }), { status: 200 })
        }
        return new Response(JSON.stringify({
            ...canonicalOrder,
            status: "attempted",
            attempts: 1,
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
    assertEquals(supabase.row.status, "failed")
    assertEquals(supabase.row.superseded_payment_ids, undefined)
})

Deno.test("a new retry records every failed payment ID on the reused order", async () => {
    const existing = attempt("failed", canonicalOrder.id)
    const request: typeof fetch = async (input) => {
        const url = new URL(String(input))
        if (url.pathname.endsWith("/payments")) {
            return new Response(JSON.stringify({
                count: 2,
                items: [
                    { id: "pay_failed_1", order_id: canonicalOrder.id, status: "failed" },
                    { id: "pay_failed_2", order_id: canonicalOrder.id, status: "failed" },
                ],
            }), { status: 200 })
        }
        return new Response(JSON.stringify({
            ...canonicalOrder,
            status: "attempted",
            attempts: 2,
            amount_paid: 0,
            amount_due: 120000,
        }), { status: 200 })
    }

    assertEquals(await getRazorpayFailedPaymentIdsForRetry({
        attempt: existing,
        bookingId: "booking-1",
        amount: 1200,
        currency: "INR",
        credentials: shared.credentials,
        request,
    }), ["pay_failed_1", "pay_failed_2"])
})

Deno.test("a paid or unresolved payment on the prior order blocks a new retry", async () => {
    const existing = attempt("failed", canonicalOrder.id)
    const orders = [
        {
            ...canonicalOrder,
            status: "paid",
            attempts: 1,
            amount_paid: 120000,
            amount_due: 0,
        },
        {
            ...canonicalOrder,
            status: "attempted",
            attempts: 1,
            amount_paid: 0,
            amount_due: 120000,
        },
    ]

    for (const order of orders) {
        const request: typeof fetch = async (input) => {
            const url = new URL(String(input))
            if (url.pathname.endsWith("/payments")) {
                return new Response(JSON.stringify({
                    count: 1,
                    items: [{
                        id: "pay_pending",
                        order_id: canonicalOrder.id,
                        status: "authorized",
                    }],
                }), { status: 200 })
            }
            return new Response(JSON.stringify(order), { status: 200 })
        }

        assertEquals(await getRazorpayFailedPaymentIdsForRetry({
            attempt: existing,
            bookingId: "booking-1",
            amount: 1200,
            currency: "INR",
            credentials: shared.credentials,
            request,
        }), null)
    }
})

Deno.test("retry persists the new request identity when reusing a failed attempt", async () => {
    const existing = attempt("failed", canonicalOrder.id)
    const supabase = database(existing)
    const request: typeof fetch = async (input) => {
        if (String(input).endsWith("/payments")) {
            return new Response(JSON.stringify({
                count: 1,
                items: [{ id: "pay_failed", order_id: canonicalOrder.id, status: "failed" }],
            }), { status: 200 })
        }
        return new Response(JSON.stringify({
            ...canonicalOrder,
            status: "attempted",
            attempts: 1,
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
        idempotencyKey: "new-request-id",
    })

    assertEquals(resumed?.provider_order_id, canonicalOrder.id)
    assertEquals(resumed?.idempotency_key, "new-request-id")
    assertEquals(supabase.row.idempotency_key, "new-request-id")
})

Deno.test("concurrent retries with different keys cannot both claim a reused attempt", async () => {
    const existing = attempt("failed", canonicalOrder.id)
    const supabase = database(existing)
    const request: typeof fetch = async (input) => {
        if (String(input).endsWith("/payments")) {
            return new Response(JSON.stringify({
                count: 1,
                items: [{ id: "pay_failed", order_id: canonicalOrder.id, status: "failed" }],
            }), { status: 200 })
        }
        return new Response(JSON.stringify({
            ...canonicalOrder,
            status: "attempted",
            attempts: 1,
            amount_paid: 0,
            amount_due: 120000,
        }), { status: 200 })
    }
    const base = {
        supabase,
        attempt: existing,
        bookingId: "booking-1",
        amount: 1200,
        currency: "INR",
        credentials: shared.credentials,
        request,
    }

    const results = await Promise.all([
        reactivatePayablePaymentAttempt({ ...base, idempotencyKey: "retry-key-one" }),
        reactivatePayablePaymentAttempt({ ...base, idempotencyKey: "retry-key-two" }),
    ])

    assertEquals(results.filter(Boolean).length, 1)
    assertEquals(
        results.filter(Boolean)[0]?.idempotency_key,
        supabase.row.idempotency_key,
    )
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

Deno.test("retry does not reuse an order with a pending Razorpay payment", async () => {
    const existing = attempt("failed", canonicalOrder.id)
    const supabase = database(existing)
    const requested: string[] = []
    const request: typeof fetch = async (input) => {
        const url = new URL(String(input))
        requested.push(url.pathname)
        if (url.pathname.endsWith("/payments")) {
            return new Response(JSON.stringify({
                count: 1,
                items: [{
                    id: "pay_pending",
                    order_id: canonicalOrder.id,
                    status: "authorized",
                }],
            }), { status: 200 })
        }
        return new Response(JSON.stringify({
            ...canonicalOrder,
            status: "attempted",
            attempts: 1,
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
    assertEquals(supabase.row.status, "failed")
    assertEquals(requested, [
        "/v1/orders/order_canonical",
        "/v1/orders/order_canonical/payments",
    ])
})

Deno.test("retry fails closed when a Razorpay payment row is missing or belongs to another order", async () => {
    const invalidPayments = [
        { id: "pay_failed", order_id: "order_other", status: "failed" },
        { order_id: canonicalOrder.id, status: "failed" },
    ]

    for (const payment of invalidPayments) {
        const existing = attempt("failed", canonicalOrder.id)
        const supabase = database(existing)
        const request: typeof fetch = async (input) => {
            const url = new URL(String(input))
            return new Response(JSON.stringify(url.pathname.endsWith("/payments")
                ? { count: 1, items: [payment] }
                : {
                    ...canonicalOrder,
                    status: "attempted",
                    attempts: 1,
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
        assertEquals(supabase.row.status, "failed")
    }
})

Deno.test("retry does not overwrite a paid attempt during provider status lookup", async () => {
    const existing = attempt("failed", canonicalOrder.id)
    const supabase = database(existing)
    const request: typeof fetch = async (input) => {
        if (String(input).endsWith("/payments")) {
            return new Response(JSON.stringify({
                count: 1,
                items: [{ id: "pay_failed", order_id: canonicalOrder.id, status: "failed" }],
            }), { status: 200 })
        }
        supabase.row.status = "paid"
        return new Response(JSON.stringify({
            ...canonicalOrder,
            status: "attempted",
            attempts: 1,
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
