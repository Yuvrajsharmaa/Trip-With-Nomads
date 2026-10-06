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

export async function createRazorpayOrder(params: {
    amount: number
    currency: string
    receipt: string
    notes: Record<string, string>
}): Promise<Record<string, any>> {
    const credentials = razorpayCredentials()
    if (!credentials.keyId || !credentials.keySecret) {
        throw new Error("Razorpay payment configuration missing")
    }

    const auth = btoa(`${credentials.keyId}:${credentials.keySecret}`)
    let response: Response
    try {
        response = await fetch("https://api.razorpay.com/v1/orders", {
            method: "POST",
            headers: {
                Authorization: `Basic ${auth}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                amount: Math.max(1, Math.round(Number(params.amount || 0) * 100)),
                currency: String(params.currency || "INR").toUpperCase(),
                receipt: String(params.receipt || "").slice(0, 40),
                notes: params.notes || {},
            }),
        })
    } catch (error) {
        throw new Error(`Razorpay API unavailable: ${String(error)}`)
    }

    const data = await response.json().catch(() => ({}))
    if (!response.ok || !data?.id) {
        const reason = firstNonEmpty(data?.error?.description, data?.error?.reason, "Could not create Razorpay order")
        throw new Error(`Razorpay order failed (${response.status}): ${reason}`)
    }
    return data
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
