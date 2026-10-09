export type ResendEmailRequest = {
    to: string | string[]
    subject: string
    html: string
    text: string
    idempotencyKey: string
    headers?: Record<string, string>
    from?: string
    replyTo?: string
}

export type ResendEmailResult = {
    sent: boolean
    skipped: boolean
    reason?: string
    providerId?: string
    data?: Record<string, unknown>
}

/**
 * Resend returns this conflict when two equivalent payment events race to
 * use the same idempotency key but serialize slightly different bodies (for
 * example, because their signed status-token expiry differs by a second).
 * The first request owns the key and has already been accepted; the later
 * event must be treated as an idempotent duplicate, not as a retryable
 * customer-email failure.
 */
export function isResendIdempotencyConflict(error: unknown): boolean {
    const message = String((error as any)?.message || error || "").toLowerCase()
    return message.includes("resend api 409") && (
        message.includes("invalid_idempotent_request") ||
        message.includes("idempotency key")
    )
}

function firstNonEmpty(...values: unknown[]): string {
    for (const value of values) {
        const next = String(value || "").trim()
        if (next) return next
    }
    return ""
}

function isEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export function normalizeResendRecipients(value: unknown): string[] {
    const values = Array.isArray(value)
        ? value
        : String(value || "").split(/[;,\n]/)
    const recipients: string[] = []
    for (const value of values) {
        const email = String(value || "").trim().toLowerCase()
        if (!email || !isEmail(email) || recipients.includes(email)) continue
        recipients.push(email)
    }
    return recipients
}

export function resolveResendFrom(): string {
    return firstNonEmpty(
        Deno.env.get("RESEND_FROM_EMAIL"),
        "Trip With Nomads <payments@tripwithnomads.com>",
    )
}

export function resolveResendReplyTo(): string {
    return firstNonEmpty(
        Deno.env.get("RESEND_REPLY_TO"),
        "support@tripwithnomads.com",
    )
}

export async function sendResendEmail(
    request: ResendEmailRequest,
): Promise<ResendEmailResult> {
    const recipients = normalizeResendRecipients(request.to)
    if (recipients.length === 0) {
        console.warn("[resend] no valid recipients; email skipped")
        return { sent: false, skipped: true, reason: "no_recipient" }
    }

    const apiKey = firstNonEmpty(Deno.env.get("RESEND_API_KEY"))
    if (!apiKey) {
        console.warn("[resend] RESEND_API_KEY is not configured; email skipped")
        return { sent: false, skipped: true, reason: "missing_api_key" }
    }

    const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": request.idempotencyKey,
        },
        body: JSON.stringify({
            from: request.from || resolveResendFrom(),
            to: recipients,
            reply_to: request.replyTo || resolveResendReplyTo(),
            subject: request.subject,
            html: request.html,
            text: request.text,
            headers: request.headers,
        }),
    })

    const data = await response.json().catch(() => ({})) as Record<string, unknown>
    if (!response.ok) {
        const reason = JSON.stringify(data).slice(0, 500)
        throw new Error(`Resend API ${response.status}: ${reason}`)
    }

    return {
        sent: true,
        skipped: false,
        providerId: firstNonEmpty(data.id),
        data,
    }
}
