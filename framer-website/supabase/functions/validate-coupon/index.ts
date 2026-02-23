import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const TAX_RATE = 0.02

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
}

type TravellerInput = {
    name?: string
    sharing?: string
}

function round2(value: number): number {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100
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

function normalizeCode(raw: string): string {
    return String(raw || "").trim().toUpperCase()
}

function normalizeTravellers(raw: any[]): TravellerInput[] {
    if (!Array.isArray(raw)) return []

    return raw.map((item) => ({
        name: typeof item?.name === "string" ? item.name.trim() : "",
        sharing: typeof item?.sharing === "string" ? item.sharing.trim() : "",
    }))
}

function json(payload: any, status = 200) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
}

function computeSubtotal(params: {
    pricingRows: any[]
    departureDate: string
    transport: string
    travellers: TravellerInput[]
}) {
    const { pricingRows, departureDate, transport, travellers } = params

    let subtotal = 0
    const missingSharings: string[] = []

    for (const traveller of travellers) {
        const sharing = String(traveller.sharing || "")
        if (!sharing) continue

        const rowsByDate = pricingRows.filter((row) => getDateValue(row) === departureDate)
        const rowByTransport = rowsByDate.find(
            (row) => getTransportValue(row) === transport && getVariantValue(row) === sharing
        )
        const rowAnyTransport = rowsByDate.find((row) => getVariantValue(row) === sharing)
        const row = rowByTransport || rowAnyTransport

        if (!row) {
            missingSharings.push(sharing)
            continue
        }

        subtotal += Number(row.price || 0)
    }

    return {
        subtotal: round2(subtotal),
        missingSharings,
    }
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
        const transport = String(body?.transport || "").trim() || "Seat in Coach"
        const email = String(body?.email || "").trim().toLowerCase()
        const couponCode = normalizeCode(body?.coupon_code || "")
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
            .select("trip_id, start_date, departure_date, transport, variant_name, sharing, price")
            .eq("trip_id", tripId)

        if (pricingError) {
            console.error("[validate-coupon] pricing fetch error", pricingError)
            return json({ valid: false, message: "Could not load pricing" }, 500)
        }

        const pricing = Array.isArray(pricingRows) ? pricingRows : []
        if (pricing.length === 0) {
            return json({ valid: false, code: couponCode, message: "No pricing found for this trip" })
        }

        const subtotalResult = computeSubtotal({
            pricingRows: pricing,
            departureDate,
            transport,
            travellers,
        })

        const subtotal = subtotalResult.subtotal
        if (subtotal <= 0) {
            return json({
                valid: false,
                code: couponCode,
                message: "Complete traveller sharing selection before applying coupon",
            })
        }

        const { data: couponRows, error: couponError } = await supabase
            .from("coupons")
            .select("*")
            .ilike("code", couponCode)
            .limit(1)

        if (couponError) {
            console.error("[validate-coupon] coupon fetch error", couponError)
            return json({ valid: false, code: couponCode, message: "Could not validate coupon" }, 500)
        }

        const coupon = couponRows?.[0]
        if (!coupon) {
            return json({ valid: false, code: couponCode, message: "Invalid coupon code" })
        }

        if (!coupon.is_active) {
            return json({ valid: false, code: coupon.code, message: "Coupon is inactive" })
        }

        const nowMs = Date.now()
        if (coupon.starts_at && nowMs < Date.parse(coupon.starts_at)) {
            return json({ valid: false, code: coupon.code, message: "Coupon is not active yet" })
        }
        if (coupon.ends_at && nowMs > Date.parse(coupon.ends_at)) {
            return json({ valid: false, code: coupon.code, message: "Coupon has expired" })
        }

        const scopedTrips = Array.isArray(coupon.applicable_trip_ids)
            ? coupon.applicable_trip_ids.map((v: any) => String(v))
            : []

        if (scopedTrips.length > 0 && !scopedTrips.includes(tripId)) {
            return json({ valid: false, code: coupon.code, message: "Coupon is not applicable for this trip" })
        }

        const minSubtotal = Number(coupon.min_subtotal || 0)
        if (subtotal < minSubtotal) {
            return json({
                valid: false,
                code: coupon.code,
                min_subtotal: minSubtotal,
                message: `Minimum subtotal ${minSubtotal.toLocaleString("en-IN")} required`,
            })
        }

        if (coupon.usage_limit_total) {
            const { count, error } = await supabase
                .from("bookings")
                .select("id", { count: "exact", head: true })
                .ilike("coupon_code", coupon.code)
                .neq("payment_status", "failed")

            if (error) {
                console.error("[validate-coupon] usage limit total error", error)
                return json({ valid: false, code: coupon.code, message: "Could not validate usage" }, 500)
            }

            if ((count || 0) >= Number(coupon.usage_limit_total)) {
                return json({ valid: false, code: coupon.code, message: "Coupon usage limit reached" })
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
                console.error("[validate-coupon] usage limit email error", error)
                return json({ valid: false, code: coupon.code, message: "Could not validate email usage" }, 500)
            }

            if ((count || 0) >= Number(coupon.usage_limit_per_email)) {
                return json({ valid: false, code: coupon.code, message: "Coupon usage limit reached for this email" })
            }
        }

        const discountType = String(coupon.discount_type || "").toLowerCase()
        const discountValue = Number(coupon.discount_value || 0)
        const maxDiscount = coupon.max_discount != null ? Number(coupon.max_discount) : null

        let discountAmount = 0
        if (discountType === "percent") {
            discountAmount = subtotal * (discountValue / 100)
            if (maxDiscount != null) {
                discountAmount = Math.min(discountAmount, maxDiscount)
            }
        } else {
            discountAmount = discountValue
        }

        discountAmount = round2(Math.max(0, Math.min(discountAmount, subtotal)))

        const discountedSubtotal = round2(subtotal - discountAmount)
        const taxAmount = round2(discountedSubtotal * TAX_RATE)
        const totalAmount = round2(discountedSubtotal + taxAmount)

        return json({
            valid: true,
            code: String(coupon.code || couponCode).toUpperCase(),
            discount_type: discountType,
            discount_value: discountValue,
            discount_amount: discountAmount,
            min_subtotal: minSubtotal,
            subtotal_amount: subtotal,
            discounted_subtotal: discountedSubtotal,
            taxable_amount: discountedSubtotal,
            tax_amount: taxAmount,
            total_amount: totalAmount,
            message: `Coupon ${String(coupon.code || couponCode).toUpperCase()} applied`,
        })
    } catch (err: any) {
        console.error("[validate-coupon] fatal", err)
        return json({ valid: false, message: err?.message || "Internal server error" }, 500)
    }
})
