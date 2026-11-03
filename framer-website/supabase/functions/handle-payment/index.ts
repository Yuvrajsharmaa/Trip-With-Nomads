import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import {
    issueBookingStatusToken,
    resolveBookingStatusSecret,
} from "../_shared/booking_status_token.ts"

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Cache-Control": "no-store",
}

function firstNonEmpty(...values: unknown[]): string {
    for (const value of values) {
        const next = String(value || "").trim()
        if (next) return next
    }
    return ""
}

function isUuid(value: unknown): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        String(value || "").trim(),
    )
}

function jsonResponse(payload: Record<string, unknown>, status = 200): Response {
    return new Response(JSON.stringify(payload), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
}

async function readRedirectInput(req: Request): Promise<Record<string, string>> {
    const url = new URL(req.url)
    const input: Record<string, string> = {}
    for (const [key, value] of url.searchParams.entries()) input[key] = value

    if (req.method === "POST") {
        const contentType = String(req.headers.get("content-type") || "").toLowerCase()
        if (contentType.includes("application/json")) {
            const body = await req.json().catch(() => ({}))
            for (const [key, value] of Object.entries(body || {})) input[key] = String(value || "")
        } else {
            const form = await req.formData().catch(() => null)
            if (form) {
                for (const [key, value] of form.entries()) input[key] = String(value || "")
            }
        }
    }
    return input
}

function isPaymentFailureCallback(input: Record<string, string>): boolean {
    const failureSignals = [
        input["error[code]"],
        input["error[description]"],
        input["error[reason]"],
        input.error_code,
        input.error_description,
        input.error_reason,
        input.payment_status,
        input.status,
        input.unmappedstatus,
        input.error,
    ]

    return failureSignals.some((value) =>
        /bad_request_error|payment_failed|failed|failure|declined|cancelled|canceled/i.test(
            String(value || ""),
        )
    )
}

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
    if (req.method !== "GET" && req.method !== "POST") {
        return jsonResponse({ error: "GET or POST required" }, 405)
    }

    try {
        const input = await readRedirectInput(req)
        const bookingId = firstNonEmpty(input.booking_id, input.udf1)
        const suppliedToken = firstNonEmpty(input.status_token)

        // The callback is intentionally not a payment decision point. It only
        // carries the browser to the status UI; the signed webhook owns all
        // payment state and Sheet projections.
        const siteBase = firstNonEmpty(
            Deno.env.get("SITE_URL"),
            Deno.env.get("PAYMENT_REDIRECT_BASE_URL"),
            "https://tripwithnomads.com",
        ).replace(/\/$/, "")
        const statusPath = isPaymentFailureCallback(input)
            ? "/payment-failed"
            : firstNonEmpty(Deno.env.get("PAYMENT_STATUS_PATH"), "/payment-success")
        const baseOrigin = /^https?:\/\//i.test(siteBase) ? siteBase : `https://${siteBase}`
        const redirectUrl = new URL(statusPath.startsWith("/") ? statusPath : `/${statusPath}`, `${baseOrigin}/`)

        if (isUuid(bookingId)) {
            redirectUrl.searchParams.set("booking_id", bookingId)
            if (suppliedToken) {
                redirectUrl.searchParams.set("status_token", suppliedToken)
            } else {
                const fallbackSecret = firstNonEmpty(
                    Deno.env.get("PAYU_LIVE_SALT"),
                    Deno.env.get("PAYU_TEST_SALT"),
                    Deno.env.get("PAYU_SALT"),
                    Deno.env.get("RAZORPAY_LIVE_KEY_SECRET"),
                    Deno.env.get("RAZORPAY_TEST_KEY_SECRET"),
                    Deno.env.get("RAZORPAY_KEY_SECRET"),
                )
                const statusSecret = resolveBookingStatusSecret(fallbackSecret)
                if (statusSecret) {
                    const token = await issueBookingStatusToken(bookingId, statusSecret)
                    redirectUrl.searchParams.set("status_token", token.token)
                }
            }
        }

        return Response.redirect(redirectUrl.toString(), 303)
    } catch (error: any) {
        console.error("[handle-payment] redirect adapter failed", error)
        return jsonResponse({ error: error?.message || "Could not redirect to payment status" }, 500)
    }
})
