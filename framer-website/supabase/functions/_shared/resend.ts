export type ResendEmailRequest = {
    to: string
    subject: string
    html: string
    text: string
    idempotencyKey: string
    from?: string
    replyTo?: string
}

export type ResendEmailResult = {
    sent: boolean
    skipped: boolean
    reason?: string
    data?: Record<string, unknown>
}

function firstNonEmpty(...values: unknown[]): string {
    for (const value of values) {
        const next = String(value || "").trim()
        if (next) return next
    }
    return ""
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
            to: [request.to],
            reply_to: request.replyTo || resolveResendReplyTo(),
            subject: request.subject,
            html: request.html,
            text: request.text,
        }),
    })

    const data = await response.json().catch(() => ({})) as Record<string, unknown>
    if (!response.ok) {
        const reason = JSON.stringify(data).slice(0, 500)
        throw new Error(`Resend API ${response.status}: ${reason}`)
    }

    return { sent: true, skipped: false, data }
}
