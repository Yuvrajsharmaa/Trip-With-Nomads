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

function json(payload: any, status = 200) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders })
    }

    try {
        if (req.method !== "POST") {
            return json({ valid: false, message: "Method not allowed" }, 405)
        }

        const supabaseUrl = Deno.env.get("SUPABASE_URL")
        const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
        if (!supabaseUrl || !serviceRole) {
            return json({ valid: false, message: "Missing Supabase environment" }, 500)
        }

        const body = await req.json()

        const tripId = String(body?.trip_id || "").trim()
        const departureDate = String(body?.departure_date || "").trim()
        const fallbackTransport = String(body?.transport || "").trim()
        const email = String(body?.email || "").trim().toLowerCase()
        const couponCode = normalizeCouponCode(body?.coupon_code || "")
        const travellers = normalizeTravellers(body?.travellers || [])

        if (!tripId || !departureDate || !couponCode) {
            return json({
                valid: false,
                code: couponCode || "",
                message: "trip_id, departure_date and coupon_code are required",
            })
        }

        const supabase = createClient(supabaseUrl, serviceRole)

        const { data: pricingRows, error: pricingError } = await supabase
            .from("trip_pricing")
            .select("*")
            .eq("trip_id", tripId)

        if (pricingError) {
            console.error("[validate-coupon] pricing fetch error", pricingError)
            return json({ valid: false, message: "Could not load pricing" }, 500)
        }

        const pricing = Array.isArray(pricingRows) ? pricingRows : []
        if (pricing.length === 0) {
            return json({ valid: false, code: couponCode, message: "No pricing found for this trip" })
        }
        const hasStructuredSharing = pricing.some((row: any) => Boolean(normalizeSharing(row?.sharing)))
        if (!hasStructuredSharing) {
            return json({
                valid: false,
                code: couponCode,
                message: "Coupons are unavailable for invite-only trips.",
            })
        }

        const basePricing = computeBasePricing({
            pricingRows: pricing,
            departureDate,
            fallbackTransport,
            travellers,
        })

        if (basePricing.missingSharings.length > 0) {
            return json({
                valid: false,
                code: couponCode,
                message: "Complete traveller sharing selection before applying coupon",
            })
        }

        const subtotal = basePricing.subtotal
        if (subtotal <= 0) {
            return json({
                valid: false,
                code: couponCode,
                message: "Complete traveller sharing selection before applying coupon",
            })
        }

        const couponResult = await validateCouponAgainstSubtotal({
            supabase,
            couponCode,
            tripId,
            subtotal,
            email,
        })

        if (!couponResult.valid) {
            return json({
                valid: false,
                code: couponResult.code || couponCode,
                min_subtotal: couponResult.min_subtotal,
                message: couponResult.message || "Invalid coupon",
            })
        }

        const quote = buildPricingQuote({
            baseSubtotal: subtotal,
            earlyBirdDiscountAmount: basePricing.earlyBirdDiscountAmount,
            couponResult,
            lineItems: basePricing.lineItems,
        })

        const hasCoupon = quote.coupon_discount_amount > 0
        const hasEarlyBird = quote.early_bird_discount_amount > 0
        const message = hasCoupon
            ? hasEarlyBird
                ? `Coupon ${couponResult.code || couponCode} applied with Early Bird`
                : `Coupon ${couponResult.code || couponCode} applied`
            : couponResult.message || "Coupon evaluated"

        return json({
            valid: true,
            code: couponResult.code || couponCode,
            discount_type: couponResult.discount_type,
            discount_value: couponResult.discount_value,
            discount_amount: couponResult.discount_amount || 0,
            min_subtotal: couponResult.min_subtotal || 0,
            coupon_wins: quote.coupon_wins,
            final_applied_source: quote.applied_discount_source,
            base_subtotal: quote.base_subtotal,
            early_bird_discount_amount: quote.early_bird_discount_amount,
            coupon_discount_amount: quote.coupon_discount_amount,
            applied_discount_source: quote.applied_discount_source,
            applied_discount_code: quote.applied_discount_code,
            discount_amount_total: quote.discount_amount_total,
            taxable_amount: quote.taxable_amount,
            tax_amount: quote.tax_amount,
            total_amount: quote.total_amount,
            line_items: quote.line_items,
            message,
        })
    } catch (err: any) {
        console.error("[validate-coupon] fatal", err)
        return json({ valid: false, message: err?.message || "Internal server error" }, 500)
    }
})
