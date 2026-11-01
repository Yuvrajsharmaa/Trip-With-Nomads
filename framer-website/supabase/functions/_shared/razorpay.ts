export type RazorpayCredentials = {
    keyId: string
    keySecret: string
}

function firstNonEmpty(...values: unknown[]): string {
    for (const value of values) {
        const next = String(value || "").trim()
        if (next) return next
    }
    return ""
}

function isTruthy(value: string | undefined): boolean {
    const raw = String(value || "").trim().toLowerCase()
    return raw === "1" || raw === "true" || raw === "yes"
}

export function razorpayTestMode(): boolean {
    const explicit = Deno.env.get("PAYMENT_GATEWAY_TEST_MODE")
    if (explicit != null && explicit !== "") return isTruthy(explicit)
    const providerMode = Deno.env.get("RAZORPAY_TEST_MODE")
    return providerMode != null && providerMode !== "" ? isTruthy(providerMode) : false
}

export function razorpayCredentials(): RazorpayCredentials {
    const testMode = razorpayTestMode()
    return {
        keyId: testMode
            ? firstNonEmpty(Deno.env.get("RAZORPAY_TEST_KEY_ID"), Deno.env.get("RAZORPAY_KEY_ID"))
            : firstNonEmpty(Deno.env.get("RAZORPAY_LIVE_KEY_ID"), Deno.env.get("RAZORPAY_KEY_ID")),
        keySecret: testMode
            ? firstNonEmpty(Deno.env.get("RAZORPAY_TEST_KEY_SECRET"), Deno.env.get("RAZORPAY_KEY_SECRET"))
            : firstNonEmpty(Deno.env.get("RAZORPAY_LIVE_KEY_SECRET"), Deno.env.get("RAZORPAY_KEY_SECRET")),
    }
}

export type RazorpayOrderParams = {
    amount: number
    currency: string
    receipt: string
    notes: Record<string, string>
}

function normalizedOrderParams(params: RazorpayOrderParams) {
    return {
        amount: Math.max(1, Math.round(Number(params.amount || 0) * 100)),
        currency: String(params.currency || "INR").toUpperCase(),
        receipt: String(params.receipt || "").slice(0, 40),
        notes: params.notes || {},
    }
}

export async function findRazorpayOrderByReceipt(
    params: RazorpayOrderParams,
    credentials = razorpayCredentials(),
    request: typeof fetch = fetch,
): Promise<Record<string, any> | null> {
    if (!credentials.keyId || !credentials.keySecret) {
        throw new Error("Razorpay payment configuration missing")
    }

    const auth = btoa(`${credentials.keyId}:${credentials.keySecret}`)
    const { amount, currency, receipt, notes } = normalizedOrderParams(params)
    const response = await request(
        `https://api.razorpay.com/v1/orders?receipt=${encodeURIComponent(receipt)}&count=100`,
        {
            method: "GET",
            headers: { Authorization: `Basic ${auth}` },
        },
    )
    if (!response.ok) throw new Error(`Could not reconcile Razorpay order (${response.status})`)
    const payload = await response.json().catch(() => ({}))
    if (!Array.isArray(payload?.items)) throw new Error("Razorpay order reconciliation returned an invalid response")
    const found = payload.items.filter((order: any) => order?.receipt === receipt)
    if (found.length > 1 || payload.items.length >= 100) {
        throw new Error("Razorpay order recovery is ambiguous for this receipt")
    }
    if (found.length === 0) return null

    const order = found[0]
    const notesMatch = Object.entries(notes).every(([key, value]) => String(order.notes?.[key] ?? "") === String(value))
    if (Number(order.amount) !== amount || String(order.currency || "").toUpperCase() !== currency || !notesMatch) {
        throw new Error("Recovered Razorpay order does not match the requested amount, currency, or notes")
    }
    if (!order.id) throw new Error("Recovered Razorpay order has no ID")
    return order
}

export async function fetchRazorpayOrderById(
    orderId: string,
    credentials = razorpayCredentials(),
    request: typeof fetch = fetch,
): Promise<Record<string, any>> {
    if (!credentials.keyId || !credentials.keySecret) {
        throw new Error("Razorpay payment configuration missing")
    }
    const id = String(orderId || "").trim()
    if (!id) throw new Error("Razorpay order ID is required")
    const auth = btoa(`${credentials.keyId}:${credentials.keySecret}`)
    const response = await request(`https://api.razorpay.com/v1/orders/${encodeURIComponent(id)}`, {
        method: "GET",
        headers: { Authorization: `Basic ${auth}` },
    })
    if (!response.ok) throw new Error(`Could not fetch Razorpay order (${response.status})`)
    const order = await response.json().catch(() => ({}))
    if (!order || order.id !== id) throw new Error("Razorpay returned a different order")
    return order
}

export function canReuseRazorpayOrderForRetry(
    order: Record<string, any>,
    params: RazorpayOrderParams,
): boolean {
    const { amount, currency, receipt, notes } = normalizedOrderParams(params)
    const status = String(order?.status || "").toLowerCase()
    if (!order?.id || !["created", "attempted"].includes(status)) return false
    if (
        Number(order.amount) !== amount ||
        String(order.currency || "").toUpperCase() !== currency ||
        Number(order.amount_paid) !== 0 ||
        Number(order.amount_due) !== amount
    ) return false
    if (receipt && String(order.receipt || "") !== receipt) return false
    return Object.entries(notes).every(([key, value]) => String(order.notes?.[key] ?? "") === String(value))
}

export async function createRazorpayOrder(
    params: RazorpayOrderParams,
    credentials = razorpayCredentials(),
    request: typeof fetch = fetch,
): Promise<Record<string, any>> {
    if (!credentials.keyId || !credentials.keySecret) {
        throw new Error("Razorpay payment configuration missing")
    }

    const auth = btoa(`${credentials.keyId}:${credentials.keySecret}`)
    const normalized = normalizedOrderParams(params)
    let response: Response | null = null
    let providerError: Error | null = null
    try {
        response = await request("https://api.razorpay.com/v1/orders", {
            method: "POST",
            headers: {
                Authorization: `Basic ${auth}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(normalized),
        })
    } catch (error) {
        providerError = new Error(`Razorpay API unavailable: ${String(error)}`)
    }

    if (response) {
        const data = await response.json().catch(() => ({}))
        if (response.ok && data?.id) return data
        const reason = firstNonEmpty(data?.error?.description, data?.error?.reason, "Could not create Razorpay order")
        providerError = new Error(`Razorpay order failed (${response.status}): ${reason}`)
    }

    try {
        const recovered = await findRazorpayOrderByReceipt(params, credentials, request)
        if (recovered) return recovered
    } catch (recoveryError) {
        const message = String((recoveryError as Error)?.message || "")
        if (message.includes("does not match") || message.includes("ambiguous")) throw recoveryError
        // Keep the provider error if recovery itself is unavailable.
    }

    if (providerError) throw providerError
    throw new Error("Razorpay order failed without a provider response")
}

export function paymentCallbackUrl(params: {
    bookingId: string
    statusToken?: string | null
    supabaseUrl: string
}): string {
    const configured = firstNonEmpty(
        Deno.env.get("PAYMENT_CALLBACK_URL"),
        `${params.supabaseUrl}/functions/v1/handle-payment`,
    )
    const url = new URL(configured)
    url.searchParams.set("booking_id", params.bookingId)
    if (params.statusToken) url.searchParams.set("status_token", params.statusToken)
    return url.toString()
}
