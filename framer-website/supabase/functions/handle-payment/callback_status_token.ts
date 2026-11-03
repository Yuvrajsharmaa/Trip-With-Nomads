import {
    issueBookingStatusToken,
    verifyBookingStatusToken,
} from "../_shared/booking_status_token.ts"
import {
    fetchRazorpayOrderById,
    type RazorpayCredentials,
} from "../_shared/razorpay.ts"

const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function signatureBytes(value: string): Uint8Array | null {
    const normalized = String(value || "").trim()
    if (!/^[0-9a-f]{64}$/i.test(normalized)) return null
    return new Uint8Array(
        normalized.match(/.{2}/g)!.map((byte) => parseInt(byte, 16)),
    )
}

async function matchesCheckoutSignature(
    orderId: string,
    paymentId: string,
    suppliedSignature: string,
    secret: string,
): Promise<boolean> {
    const actual = signatureBytes(suppliedSignature)
    if (!actual || !secret) return false

    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
    )
    const expected = new Uint8Array(
        await crypto.subtle.sign(
            "HMAC",
            key,
            new TextEncoder().encode(`${orderId}|${paymentId}`),
        ),
    )
    if (actual.length !== expected.length) return false

    let difference = 0
    for (let index = 0; index < actual.length; index += 1) {
        difference |= actual[index] ^ expected[index]
    }
    return difference === 0
}

export async function resolveCallbackStatusToken(params: {
    bookingId: string
    suppliedToken: string
    statusSecrets: string[]
    statusSecret: string
    credentials: RazorpayCredentials
    razorpayOrderId: string
    razorpayPaymentId: string
    razorpaySignature: string
    request?: typeof fetch
}): Promise<string> {
    const bookingId = String(params.bookingId || "").trim().toLowerCase()
    const suppliedToken = String(params.suppliedToken || "").trim()
    if (!UUID_PATTERN.test(bookingId)) return ""

    for (const secret of params.statusSecrets) {
        if (await verifyBookingStatusToken(suppliedToken, bookingId, secret)) {
            return suppliedToken
        }
    }

    const orderId = String(params.razorpayOrderId || "").trim()
    const paymentId = String(params.razorpayPaymentId || "").trim()
    if (
        !/^order_[a-z0-9]+$/i.test(orderId) ||
        !/^pay_[a-z0-9]+$/i.test(paymentId)
    ) return ""
    if (
        !await matchesCheckoutSignature(
            orderId,
            paymentId,
            params.razorpaySignature,
            params.credentials.keySecret,
        )
    ) {
        return ""
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    let order: Record<string, any>
    try {
        order = await fetchRazorpayOrderById(
            orderId,
            params.credentials,
            (input, init) =>
                (params.request ?? fetch)(input, {
                    ...init,
                    signal: controller.signal,
                }),
        )
    } finally {
        clearTimeout(timeout)
    }
    if (
        String(order.notes?.booking_id || "").trim().toLowerCase() !== bookingId
    ) return ""

    const secret = String(
        params.statusSecret || params.credentials.keySecret || "",
    ).trim()
    if (!secret) return ""
    return (await issueBookingStatusToken(bookingId, secret)).token
}
