import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const TAX_RATE = 0.02

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
}

type TravellerInput = {
    id?: number
    name?: string
    sharing?: string
    transport?: string
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

function toNumber(value: any): number {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
}

function getDateValue(row: any): string {
    return row?.start_date || row?.departure_date || ""
}

function getVariantValue(row: any): string {
    return row?.variant_name || row?.sharing || ""
}

function getTransportValue(row: any): string {
    return row?.transport || "Seat in Coach"
}

function normalizeCouponCode(raw: string): string {
    return String(raw || "").trim().toUpperCase()
}

function normalizeTravellers(input: any[]): TravellerInput[] {
    if (!Array.isArray(input)) return []

    return input.map((item) => ({
        id: Number(item?.id) || undefined,
        name: typeof item?.name === "string" ? item.name.trim() : "",
        sharing: typeof item?.sharing === "string" ? item.sharing.trim() : "",
        transport: typeof item?.transport === "string" ? item.transport.trim() : "",
    }))
}

function computePricing(params: {
    pricingRows: any[]
    departureDate: string
    fallbackTransport: string
    travellers: TravellerInput[]
}) {
    const { pricingRows, departureDate, fallbackTransport, travellers } = params

    let subtotal = 0
    const missingSharings: string[] = []
    const groups: Record<string, { count: number; unit: number }> = {}

    const rowsByDate = pricingRows.filter((row) => getDateValue(row) === departureDate)

    for (const traveller of travellers) {
        const sharing = String(traveller.sharing || "")
        const transport =
            String(traveller.transport || "").trim() || fallbackTransport || "Seat in Coach"
        if (!sharing) {
            missingSharings.push("<blank>")
            continue
        }

        const rowByTransport = rowsByDate.find(
            (row) => getTransportValue(row) === transport && getVariantValue(row) === sharing
        )
        const rowAnyTransport = rowsByDate.find((row) => getVariantValue(row) === sharing)
        const row = rowByTransport || rowAnyTransport

        if (!row) {
            missingSharings.push(sharing)
            continue
        }

        const unitPrice = toNumber(row.price)
        if (unitPrice <= 0) {
            missingSharings.push(sharing)
            continue
        }

        subtotal += unitPrice
        const key = `${transport}__${sharing}`
        if (!groups[key]) groups[key] = { count: 0, unit: unitPrice }
        groups[key].count += 1
    }

    const breakdown = Object.entries(groups).map(([key, data]) => {
        const parts = key.split("__")
        const transport = parts[0] || "Seat in Coach"
        const variant = parts[1] || ""
        return {
            label: `${data.count}x Guest (${variant}${transport ? ` · ${transport}` : ""})`,
            price: data.unit * data.count,
            unit_price: data.unit,
            count: data.count,
            variant,
            transport,
        }
    })

    return {
        subtotal: round2(subtotal),
        missingSharings,
        breakdown,
    }
}

async function validateCoupon(params: {
    supabase: any
    couponCode: string
    tripId: string
    subtotal: number
    email: string
}) {
    const { supabase, couponCode, tripId, subtotal, email } = params

    if (!couponCode) {
        return {
            valid: true,
            discountAmount: 0,
            couponSnapshot: null,
            code: null,
        }
    }

    const { data: couponRows, error: couponError } = await supabase
        .from("coupons")
        .select("*")
        .ilike("code", couponCode)
        .limit(1)

    if (couponError) {
        throw new Error(`Coupon lookup failed: ${couponError.message}`)
    }

    const coupon = couponRows?.[0]
    if (!coupon) {
        return { valid: false, message: "Invalid coupon code" }
    }

    if (!coupon.is_active) {
        return { valid: false, message: "Coupon is inactive" }
    }

    const now = Date.now()
    if (coupon.starts_at && now < Date.parse(coupon.starts_at)) {
        return { valid: false, message: "Coupon is not active yet" }
    }
    if (coupon.ends_at && now > Date.parse(coupon.ends_at)) {
        return { valid: false, message: "Coupon has expired" }
    }

    const scopedTrips = Array.isArray(coupon.applicable_trip_ids)
        ? coupon.applicable_trip_ids.map((v: any) => String(v))
        : []

    if (scopedTrips.length > 0 && !scopedTrips.includes(tripId)) {
        return { valid: false, message: "Coupon is not applicable for this trip" }
    }

    const minSubtotal = toNumber(coupon.min_subtotal)
    if (subtotal < minSubtotal) {
        return {
            valid: false,
            message: `Minimum subtotal ${minSubtotal.toLocaleString("en-IN")} required`,
        }
    }

    if (coupon.usage_limit_total) {
        const { count, error } = await supabase
            .from("bookings")
            .select("id", { count: "exact", head: true })
            .ilike("coupon_code", coupon.code)
            .neq("payment_status", "failed")

        if (error) {
            throw new Error(`Coupon usage check failed: ${error.message}`)
        }

        if ((count || 0) >= Number(coupon.usage_limit_total)) {
            return { valid: false, message: "Coupon usage limit reached" }
        }
    }

    if (coupon.usage_limit_per_email && email) {
        const { count, error } = await supabase
            .from("bookings")
            .select("id", { count: "exact", head: true })
            .ilike("coupon_code", coupon.code)
            .eq("email", email)
            .neq("payment_status", "failed")

        if (error) {
            throw new Error(`Coupon usage check failed: ${error.message}`)
        }

        if ((count || 0) >= Number(coupon.usage_limit_per_email)) {
            return { valid: false, message: "Coupon usage limit reached for this email" }
        }
    }

    const discountType = String(coupon.discount_type || "").toLowerCase()
    const discountValue = toNumber(coupon.discount_value)
    const maxDiscount = coupon.max_discount != null ? toNumber(coupon.max_discount) : null

    let discountAmount = 0
    if (discountType === "percent") {
        discountAmount = subtotal * (discountValue / 100)
        if (maxDiscount != null) discountAmount = Math.min(discountAmount, maxDiscount)
    } else {
        discountAmount = discountValue
    }

    discountAmount = round2(Math.max(0, Math.min(discountAmount, subtotal)))

    return {
        valid: true,
        code: String(coupon.code || couponCode).toUpperCase(),
        discountAmount,
        couponSnapshot: {
            id: coupon.id,
            code: String(coupon.code || couponCode).toUpperCase(),
            discount_type: discountType,
            discount_value: discountValue,
            max_discount: maxDiscount,
            min_subtotal: minSubtotal,
            applicable_trip_ids: scopedTrips,
        },
    }
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
        const body = await req.json()

        const tripId = String(body?.trip_id || "").trim()
        const departureDate = String(body?.departure_date || "").trim()
        const fallbackTransport = String(body?.transport || "").trim() || "Seat in Coach"
        const travellers = normalizeTravellers(body?.travellers || [])
        const couponCode = normalizeCouponCode(body?.coupon_code || "")
        const pricingSnapshot = body?.pricing_snapshot

        const name = String(body?.name || "").trim()
        const email = String(body?.email || "").trim()
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
            .select("trip_id, start_date, departure_date, transport, variant_name, sharing, price")
            .eq("trip_id", tripId)

        if (pricingError) {
            console.error("[create-booking] pricing fetch error", pricingError)
            return json({ error: "Could not load trip pricing" }, 500)
        }

        const pricing = Array.isArray(pricingRows) ? pricingRows : []
        if (pricing.length === 0) {
            return json({ error: "No pricing found for selected trip" }, 400)
        }

        const pricingResult = computePricing({
            pricingRows: pricing,
            departureDate,
            fallbackTransport,
            travellers,
        })

        if (pricingResult.missingSharings.length > 0) {
            return json(
                {
                    error: "Some traveller sharing options could not be priced",
                    missing: pricingResult.missingSharings,
                },
                400
            )
        }

        const subtotalAmount = pricingResult.subtotal
        if (subtotalAmount <= 0) {
            return json({ error: "Subtotal is zero. Please complete traveller details" }, 400)
        }

        const couponResult = await validateCoupon({
            supabase,
            couponCode,
            tripId,
            subtotal: subtotalAmount,
            email,
        })

        if (!couponResult.valid) {
            return json({ error: couponResult.message || "Invalid coupon" }, 400)
        }

        const discountAmount = round2(toNumber(couponResult.discountAmount || 0))
        const discountedSubtotal = round2(Math.max(0, subtotalAmount - discountAmount))
        const taxAmount = round2(discountedSubtotal * TAX_RATE)
        const totalAmount = round2(discountedSubtotal + taxAmount)

        const computedPricing = {
            subtotal_amount: subtotalAmount,
            discount_amount: discountAmount,
            tax_amount: taxAmount,
            total_amount: totalAmount,
        }

        const mismatchErrors = buildPricingMismatchErrors(pricingSnapshot, computedPricing)
        if (mismatchErrors.length > 0) {
            return json(
                {
                    error: "Pricing mismatch. Please refresh checkout and try again.",
                    server_pricing: computedPricing,
                },
                409
            )
        }

        const paymentBreakdown = [...pricingResult.breakdown]
        if (discountAmount > 0 && couponResult.code) {
            paymentBreakdown.push({
                label: `Coupon (${couponResult.code})`,
                price: -discountAmount,
                unit_price: -discountAmount,
                count: 1,
                variant: "coupon",
            })
        }

        const txnid =
            "txn_" + Date.now().toString().slice(-10) + Math.floor(Math.random() * 10000).toString()

        const { data: booking, error: insertError } = await supabase
            .from("bookings")
            .insert({
                trip_id: tripId,
                departure_date: departureDate,
                transport: fallbackTransport,
                travellers,
                payment_breakdown: paymentBreakdown,
                subtotal_amount: subtotalAmount,
                discount_amount: discountAmount,
                tax_amount: taxAmount,
                total_amount: totalAmount,
                coupon_code: couponResult.code || null,
                coupon_snapshot: couponResult.couponSnapshot,
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
        const amountString = totalAmount.toFixed(2)

        const hashString = `${PAYU_KEY}|${txnid}|${amountString}|${productinfo}|${firstname}|${email}|${udf1}||||||||||${PAYU_SALT}`

        const hashBuffer = await crypto.subtle.digest("SHA-512", new TextEncoder().encode(hashString))
        const hash = Array.from(new Uint8Array(hashBuffer))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("")

        const actionUrl = IS_TEST ? "https://test.payu.in/_payment" : "https://secure.payu.in/_payment"

        return json({
            booking_id: booking.id,
            applied_coupon: couponResult.code
                ? {
                      code: couponResult.code,
                      discount_amount: discountAmount,
                      discount_type: couponResult.couponSnapshot?.discount_type,
                      discount_value: couponResult.couponSnapshot?.discount_value,
                  }
                : null,
            pricing_summary: {
                subtotal_amount: subtotalAmount,
                discount_amount: discountAmount,
                tax_amount: taxAmount,
                total_amount: totalAmount,
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
