export type RazorpayCallbackIdentifiers = {
    paymentId: string
    orderId: string
    signature: string
    errorCode: string
    errorDescription: string
}

function firstNonEmpty(...values: unknown[]): string {
    for (const value of values) {
        const next = String(value ?? "").trim()
        if (next) return next
    }
    return ""
}

function parseJsonRecord(source: unknown): Record<string, unknown> {
    if (source && typeof source === "object" && !Array.isArray(source)) {
        return source as Record<string, unknown>
    }

    if (typeof source !== "string" || !source.trim()) return {}

    try {
        const parsed = JSON.parse(source)
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            return parsed as Record<string, unknown>
        }
    } catch {
        // Razorpay failure payloads can contain malformed optional metadata.
    }

    return {}
}

export function extractRazorpayCallbackIdentifiers(
    payload: Record<string, string>,
): RazorpayCallbackIdentifiers {
    const error = parseJsonRecord(payload.error)
    const metadata = parseJsonRecord(payload["error[metadata]"] || error.metadata)

    return {
        paymentId: firstNonEmpty(
            payload.razorpay_payment_id,
            payload["error[metadata][payment_id]"],
            metadata.payment_id,
            parseJsonRecord(error.metadata).payment_id,
        ),
        orderId: firstNonEmpty(
            payload.razorpay_order_id,
            payload["error[metadata][order_id]"],
            metadata.order_id,
            parseJsonRecord(error.metadata).order_id,
        ),
        signature: firstNonEmpty(payload.razorpay_signature),
        errorCode: firstNonEmpty(
            payload["error[code]"],
            payload.error_code,
            error.code,
        ).toLowerCase(),
        errorDescription: firstNonEmpty(
            payload["error[description]"],
            payload.error_description,
            error.description,
        ),
    }
}
