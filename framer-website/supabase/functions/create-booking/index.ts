import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import {
    buildPricingQuote,
    computeBasePricing,
    normalizeCouponCode,
    normalizeSharing,
    normalizeTravellers,
    validateCouponAgainstSubtotal,
} from "../_shared/pricing.ts"

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function json(payload: Record<string, unknown>, status = 200) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
}

function round2(value: number): number {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100
}

function toNumber(value: unknown): number {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
}

function normalizePaymentMode(value: unknown): "full" | "partial_25" {
    return String(value || "").trim().toLowerCase() === "partial_25" ? "partial_25" : "full"
}

function shouldEnforcePricingSnapshot(): boolean {
    const raw = String(Deno.env.get("ENFORCE_PRICING_SNAPSHOT") || "")
        .trim()
        .toLowerCase()
    return raw === "1" || raw === "true" || raw === "yes"
}

function buildPricingMismatchErrors(pricingSnapshot: any, computed: any): string[] {
    const errors: string[] = []
    if (!pricingSnapshot || typeof pricingSnapshot !== "object") return errors

    const fields = ["subtotal_amount", "discount_amount", "tax_amount", "total_amount"] as const

    for (const field of fields) {
        if (pricingSnapshot[field] == null) continue
        const clientValue = toNumber(pricingSnapshot[field])
        const serverValue = toNumber(computed[field])
        if (Math.abs(clientValue - serverValue) > 1) {
            errors.push(`${field} mismatch`)
        }
    }

    return errors
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders })
    }

    if (req.method !== "POST") {
        return json({ error: "Method not allowed" }, 405)
    }

    try {
        const contentType = String(req.headers.get("content-type") || "").toLowerCase()
        let body: any = {}
        if (contentType.includes("application/x-www-form-urlencoded")) {
            const raw = await req.text()
            const form = new URLSearchParams(raw)
            let parsedTravellers: any[] = []
            let parsedPricingSnapshot: Record<string, unknown> | null = null
            try {
                parsedTravellers = JSON.parse(form.get("travellers") || "[]")
            } catch {
                parsedTravellers = []
            }
            try {
                parsedPricingSnapshot = JSON.parse(form.get("pricing_snapshot") || "null")
            } catch {
                parsedPricingSnapshot = null
            }
            body = {
                trip_id: form.get("trip_id"),
                departure_date: form.get("departure_date") || form.get("date"),
                transport: form.get("transport"),
                travellers: parsedTravellers,
                coupon_code: form.get("coupon_code"),
                pricing_snapshot: parsedPricingSnapshot,
                name: form.get("name"),
                email: form.get("email"),
                phone: form.get("phone"),
                payment_mode: form.get("payment_mode"),
            }
        } else {
            body = await req.json()
        }

        const tripId = String(body?.trip_id || "").trim()
        const departureDate = String(body?.departure_date || "").trim()
        const fallbackTransport = String(body?.transport || "").trim()
        const travellers = normalizeTravellers(body?.travellers || [])
        const couponCode = normalizeCouponCode(body?.coupon_code || "")
        const paymentMode = normalizePaymentMode(body?.payment_mode)
        const pricingSnapshot = body?.pricing_snapshot

        const name = String(body?.name || "").trim()
        const email = String(body?.email || "").trim().toLowerCase()
        const phone = String(body?.phone || "").trim()

        if (!tripId || !departureDate || travellers.length === 0 || !name || !email) {
            return json(
                {
                    error: "Missing required fields (trip_id, departure_date, travellers, name, email)",
                },
                400
            )
        }

        const supabaseUrl = Deno.env.get("SUPABASE_URL")
        const supabaseServiceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

        if (!supabaseUrl || !supabaseServiceRole) {
            return json({ error: "Supabase environment not configured" }, 500)
        }

        const IS_TEST = Deno.env.get("PAYU_TEST_MODE") === "true"
        const PAYU_KEY = IS_TEST
            ? Deno.env.get("PAYU_TEST_KEY") || Deno.env.get("PAYU_KEY")
            : Deno.env.get("PAYU_LIVE_KEY") || Deno.env.get("PAYU_KEY")
        const PAYU_SALT = IS_TEST
            ? Deno.env.get("PAYU_TEST_SALT") || Deno.env.get("PAYU_SALT")
            : Deno.env.get("PAYU_LIVE_SALT") || Deno.env.get("PAYU_SALT")

        if (!PAYU_KEY || !PAYU_SALT) {
            return json({ error: "Payment configuration missing" }, 500)
        }

        const supabase = createClient(supabaseUrl, supabaseServiceRole)

        const { data: pricingRows, error: pricingError } = await supabase
            .from("trip_pricing")
            .select("*")
            .eq("trip_id", tripId)

        if (pricingError) {
            console.error("[create-booking] pricing fetch error", pricingError)
            return json({ error: "Could not load trip pricing" }, 500)
        }

        const pricing = Array.isArray(pricingRows) ? pricingRows : []
        if (pricing.length === 0) {
            return json({ error: "No pricing found for selected trip" }, 400)
        }
        const hasStructuredSharing = pricing.some((row: any) => Boolean(normalizeSharing(row?.sharing)))
        if (!hasStructuredSharing) {
            return json(
                { error: "This trip is invite-only. Online checkout is unavailable." },
                403
            )
        }

        const basePricing = computeBasePricing({
            pricingRows: pricing,
            departureDate,
            fallbackTransport,
            travellers,
        })

        if (basePricing.missingSharings.length > 0) {
            return json(
                {
                    error: "Some traveller sharing options could not be priced",
                    missing: basePricing.missingSharings,
                },
                400
            )
        }

        const subtotalAmount = round2(basePricing.subtotal)
        if (subtotalAmount <= 0) {
            return json({ error: "Subtotal is zero. Please complete traveller details" }, 400)
        }

        const couponResult = await validateCouponAgainstSubtotal({
            supabase,
            couponCode,
            tripId,
            subtotal: subtotalAmount,
            email,
        })

        if (!couponResult.valid) {
            return json({ error: couponResult.message || "Invalid coupon" }, 400)
        }

        const quote = buildPricingQuote({
            baseSubtotal: subtotalAmount,
            earlyBirdDiscountAmount: basePricing.earlyBirdDiscountAmount,
            couponResult,
            lineItems: basePricing.lineItems.map((item) => ({
                traveller_id: item.traveller_id,
                sharing: item.sharing,
                transport: item.transport,
                unit_price: item.unit_price,
            })),
        })

        const computedPricing = {
            subtotal_amount: quote.base_subtotal,
            discount_amount: quote.discount_amount_total,
            tax_amount: quote.tax_amount,
            total_amount: quote.total_amount,
        }

        const partialBaseDeposit = round2(quote.base_subtotal * 0.25)
        const payableNowAmount =
            paymentMode === "partial_25"
                ? round2(Math.min(Math.max(0, partialBaseDeposit), quote.total_amount))
                : round2(quote.total_amount)
        const dueAmount = round2(Math.max(0, quote.total_amount - payableNowAmount))
        const settlementStatusPreview =
            paymentMode === "partial_25" ? "partially_paid" : "fully_paid"

        const mismatchErrors = buildPricingMismatchErrors(pricingSnapshot, computedPricing)
        const enforcePricingSnapshot = shouldEnforcePricingSnapshot()
        if (mismatchErrors.length > 0) {
            console.warn("[create-booking] pricing snapshot mismatch", {
                mismatchErrors,
                enforcePricingSnapshot,
                clientSnapshot: pricingSnapshot,
                serverPricing: computedPricing,
            })
            if (enforcePricingSnapshot) {
                return json(
                    {
                        error: "Pricing mismatch. Please refresh checkout and try again.",
                        server_pricing: computedPricing,
                    },
                    409
                )
            }
        }

        const paymentBreakdown = [...basePricing.paymentBreakdown]
        if (quote.early_bird_discount_amount > 0) {
            paymentBreakdown.push({
                label: "Early Bird Discount",
                price: -quote.early_bird_discount_amount,
                unit_price: -quote.early_bird_discount_amount,
                count: 1,
                variant: "early_bird",
                transport: fallbackTransport || "",
            })
        }
        if (quote.coupon_discount_amount > 0 && quote.applied_discount_code) {
            paymentBreakdown.push({
                label: `Coupon (${quote.applied_discount_code})`,
                price: -quote.coupon_discount_amount,
                unit_price: -quote.coupon_discount_amount,
                count: 1,
                variant: "coupon",
                transport: fallbackTransport || "",
            })
        }

        const txnid =
            "txn_" + Date.now().toString().slice(-10) + Math.floor(Math.random() * 10000).toString()

        const selectedCouponSnapshot =
            quote.coupon_discount_amount > 0 ? couponResult.couponSnapshot || null : null

        const { data: booking, error: insertError } = await supabase
            .from("bookings")
            .insert({
                trip_id: tripId,
                departure_date: departureDate,
                transport: fallbackTransport,
                travellers,
                payment_breakdown: paymentBreakdown,
                subtotal_amount: quote.base_subtotal,
                discount_amount: quote.discount_amount_total,
                tax_amount: quote.tax_amount,
                total_amount: quote.total_amount,
                coupon_code: quote.coupon_discount_amount > 0 ? quote.applied_discount_code : null,
                coupon_snapshot: selectedCouponSnapshot,
                name,
                email,
                phone,
                currency: "INR",
                payment_status: "pending",
                payu_txnid: txnid,
            })
            .select()
            .single()

        if (insertError || !booking) {
            console.error("[create-booking] insert error", insertError)
            return json({ error: insertError?.message || "Could not create booking" }, 500)
        }

        const productinfo = "Trip Booking"
        const firstname = name.split(" ")[0] || name
        const udf1 = booking.id
        const amountString = payableNowAmount.toFixed(2)

        const hashString = `${PAYU_KEY}|${txnid}|${amountString}|${productinfo}|${firstname}|${email}|${udf1}||||||||||${PAYU_SALT}`

        const hashBuffer = await crypto.subtle.digest("SHA-512", new TextEncoder().encode(hashString))
        const hash = Array.from(new Uint8Array(hashBuffer))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("")

        const actionUrl = IS_TEST ? "https://test.payu.in/_payment" : "https://secure.payu.in/_payment"

        return json({
            booking_id: booking.id,
            payment_mode: paymentMode,
            payable_now_amount: payableNowAmount,
            due_amount: dueAmount,
            settlement_status_preview: settlementStatusPreview,
            applied_coupon:
                quote.coupon_discount_amount > 0 && quote.applied_discount_code
                    ? {
                          code: quote.applied_discount_code,
                          discount_amount: quote.coupon_discount_amount,
                          discount_type: couponResult.discount_type,
                          discount_value: couponResult.discount_value,
                      }
                    : null,
            pricing_summary: {
                subtotal_amount: quote.base_subtotal,
                early_bird_discount_amount: quote.early_bird_discount_amount,
                coupon_discount_amount: quote.coupon_discount_amount,
                discount_amount: quote.discount_amount_total,
                applied_discount_source: quote.applied_discount_source,
                applied_discount_code: quote.applied_discount_code,
                taxable_amount: quote.taxable_amount,
                tax_amount: quote.tax_amount,
                total_amount: quote.total_amount,
                payable_now_amount: payableNowAmount,
                due_amount: dueAmount,
                payment_mode: paymentMode,
                line_items: quote.line_items,
                transport: fallbackTransport,
                departure_date: departureDate,
            },
            payu: {
                key: PAYU_KEY,
                txnid,
                amount: amountString,
                productinfo,
                firstname,
                email,
                phone: phone || "",
                surl:
                    Deno.env.get("PAYMENT_CALLBACK_URL") ||
                    `${supabaseUrl}/functions/v1/handle-payment`,
                furl:
                    Deno.env.get("PAYMENT_CALLBACK_URL") ||
                    `${supabaseUrl}/functions/v1/handle-payment`,
                hash,
                udf1,
                action: actionUrl,
            },
        })
    } catch (err: any) {
        console.error("[create-booking] fatal", err)
        return json({ error: err?.message || "Internal server error" }, 500)
    }
})
