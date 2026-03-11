import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { buildBookingSheetRow, BOOKING_HEADERS } from "../_shared/booking_sheets.ts"
import { appendRow, sheetsEnabled } from "../_shared/sheets.ts"

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const TAX_RATE = 0.05

type PaymentMode = "full" | "partial_25"
type SharingValue = "Quad" | "Triple" | "Double" | ""

type TravellerInput = {
    id?: number
    name?: string
    sharing?: string
    transport?: string
    vehicle?: string
}

type TravellerResolved = {
    id: number
    name: string
    sharing: SharingValue
    transport: string
}

type PricingBreakdown = {
    base_subtotal: number
    early_bird_discount_amount: number
    coupon_discount_amount: number
    applied_discount_source: "none" | "early_bird" | "coupon"
    applied_discount_code: string | null
    discount_amount_total: number
    taxable_amount: number
    tax_amount: number
    total_amount: number
    line_items: Array<{
        traveller_id: number
        sharing: string
        transport: string
        unit_price: number
    }>
}

function toNumber(value: any): number {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
}

function round2(value: number): number {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100
}

function normalizePaymentMode(value: any): PaymentMode {
    return String(value || "").trim().toLowerCase() === "partial_25" ? "partial_25" : "full"
}

function firstNonEmpty(...values: any[]): string {
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

function isMissingColumnError(error: any, columnName: string): boolean {
    const needle = String(columnName || "").trim().toLowerCase()
    if (!needle) return false
    const message = String(error?.message || error?.details || error?.hint || error || "")
        .trim()
        .toLowerCase()
    return message.includes("column") && message.includes(needle)
}

function bookingSheetsWriteEnabled(): boolean {
    return isTruthy(Deno.env.get("BOOKING_SHEETS_WRITE_ENABLED"))
}

function bookingLifecycleSheetsWriteEnabled(): boolean {
    return isTruthy(Deno.env.get("BOOKING_LIFECYCLE_SHEETS_WRITE_ENABLED"))
}

function parseJsonField(value: FormDataEntryValue | null): any {
    const raw = String(value || "").trim()
    if (!raw) return null
    try {
        return JSON.parse(raw)
    } catch (_) {
        return null
    }
}

function parsePositiveId(value: any, fallback: number): number {
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed > 0) return Math.round(parsed)
    return fallback
}

function normalizeSharing(value: any): SharingValue {
    const raw = String(value || "").trim()
    if (!raw) return ""
    const lower = raw.toLowerCase()
    if (lower.includes("quad")) return "Quad"
    if (lower.includes("triple")) return "Triple"
    if (lower.includes("double")) return "Double"
    return ""
}

function normalizeDateKey(value: any): string {
    const raw = String(value || "").trim()
    if (!raw) return ""

    const direct = /^(\d{4}-\d{2}-\d{2})/.exec(raw)
    if (direct?.[1]) return direct[1]

    const parsed = Date.parse(raw)
    if (Number.isFinite(parsed)) {
        return new Date(parsed).toISOString().slice(0, 10)
    }

    return raw
}

function getDateValue(row: any): string {
    return normalizeDateKey(row?.start_date || row?.departure_date || row?.date || "")
}

function getVariantValue(row: any): SharingValue {
    return normalizeSharing(row?.sharing || row?.variant_name)
}

function getTransportValue(row: any): string {
    const vehicle = String(row?.vehicle || "").trim()
    if (vehicle) return vehicle
    const transport = String(row?.transport || "").trim()
    if (transport) return transport
    return ""
}

function pickBestPricingRow(rows: any[]): any | null {
    if (!Array.isArray(rows) || rows.length === 0) return null
    return rows.reduce((best, row) => {
        if (!best) return row
        const bestPrice = toNumber(best?.price)
        const nextPrice = toNumber(row?.price)
        if (nextPrice < bestPrice) return row
        if (nextPrice > bestPrice) return best

        const bestCreated = Date.parse(String(best?.created_at || ""))
        const nextCreated = Date.parse(String(row?.created_at || ""))
        if (Number.isFinite(nextCreated) && Number.isFinite(bestCreated) && nextCreated > bestCreated) {
            return row
        }
        return best
    }, rows[0] || null)
}

function getDatePricingRows(pricingRows: any[], departureDate: string): any[] {
    return (pricingRows || []).filter((row: any) => getDateValue(row) === departureDate)
}

function getTransportOptions(pricingRows: any[], departureDate: string): string[] {
    const rows = getDatePricingRows(pricingRows, departureDate)
    return [...new Set(rows.map((row: any) => getTransportValue(row)).filter(Boolean))].sort()
}

function getSharingOptions(pricingRows: any[], departureDate: string, transport: string): SharingValue[] {
    const rows = getDatePricingRows(pricingRows, departureDate).filter(
        (row: any) => !transport || getTransportValue(row) === transport
    )
    const set = new Set<SharingValue>(
        rows
            .map((row: any) => getVariantValue(row))
            .filter((value: SharingValue) => value === "Quad" || value === "Triple" || value === "Double")
    )

    const ordered: SharingValue[] = []
    if (set.has("Quad")) ordered.push("Quad")
    if (set.has("Triple")) ordered.push("Triple")
    if (set.has("Double")) ordered.push("Double")
    return ordered
}

function getCheapestPricingRow(pricingRows: any[], departureDate: string, transport = ""): any | null {
    const byDate = getDatePricingRows(pricingRows, departureDate).filter(
        (row: any) => toNumber(row?.price) > 0 && Boolean(getVariantValue(row))
    )
    if (byDate.length === 0) return null

    const byTransport = transport
        ? byDate.filter((row: any) => getTransportValue(row) === transport)
        : byDate
    const best = pickBestPricingRow(byTransport)
    if (best) return best
    if (transport) return pickBestPricingRow(byDate)
    return null
}

function getDefaultTransportForDate(
    pricingRows: any[],
    departureDate: string,
    preferredTransport = ""
): string {
    const options = getTransportOptions(pricingRows, departureDate)
    if (options.length === 0) return ""
    if (preferredTransport && options.includes(preferredTransport)) return preferredTransport

    const cheapestRow = getCheapestPricingRow(pricingRows, departureDate)
    const cheapestTransport = getTransportValue(cheapestRow)
    if (cheapestTransport && options.includes(cheapestTransport)) return cheapestTransport

    return options[0] || ""
}

function getDefaultSharingForDate(
    pricingRows: any[],
    departureDate: string,
    transport = ""
): SharingValue {
    const options = getSharingOptions(pricingRows, departureDate, transport)
    if (options.length === 0) return ""

    const cheapestForTransport = getCheapestPricingRow(pricingRows, departureDate, transport)
    const cheapestSharing = getVariantValue(cheapestForTransport)
    if (cheapestSharing && options.includes(cheapestSharing)) return cheapestSharing

    const cheapestOverall = getCheapestPricingRow(pricingRows, departureDate)
    const cheapestOverallSharing = getVariantValue(cheapestOverall)
    if (cheapestOverallSharing && options.includes(cheapestOverallSharing)) return cheapestOverallSharing

    return options[0] || ""
}

function resolvePricingRowForTraveller(
    pricingRows: any[],
    departureDate: string,
    transport: string,
    sharing: SharingValue
): any | null {
    const byTransportRows = getDatePricingRows(pricingRows, departureDate).filter(
        (row: any) =>
            (!transport || getTransportValue(row) === transport) &&
            getVariantValue(row) === sharing
    )
    const byTransport = pickBestPricingRow(byTransportRows)
    if (byTransport) return byTransport

    const fallbackRows = getDatePricingRows(pricingRows, departureDate).filter(
        (row: any) => getVariantValue(row) === sharing
    )
    return pickBestPricingRow(fallbackRows)
}

function isEarlyBirdActive(row: any): boolean {
    if (!row?.early_bird_enabled) return false
    const now = Date.now()
    const start = row?.early_bird_starts_at ? Date.parse(String(row.early_bird_starts_at)) : null
    const end = row?.early_bird_ends_at ? Date.parse(String(row.early_bird_ends_at)) : null
    if (Number.isFinite(start) && now < (start as number)) return false
    if (Number.isFinite(end) && now > (end as number)) return false
    return true
}

function computeEarlyBirdDiscountForRow(row: any, unitPrice: number): number {
    if (!isEarlyBirdActive(row) || unitPrice <= 0) return 0
    const type = String(row?.early_bird_discount_type || "").toLowerCase()
    const value = toNumber(row?.early_bird_discount_value)
    if (value <= 0) return 0

    let discount = type === "percent" ? unitPrice * (value / 100) : value
    const maxDiscount = row?.early_bird_max_discount != null ? toNumber(row?.early_bird_max_discount) : null
    if (maxDiscount != null && maxDiscount > 0) discount = Math.min(discount, maxDiscount)

    return round2(Math.max(0, Math.min(discount, unitPrice)))
}

function normalizeTravellers(input: TravellerInput[]): TravellerResolved[] {
    const source = Array.isArray(input) ? input : []
    return source.map((traveller, index) => ({
        id: parsePositiveId(traveller?.id, index + 1),
        name: String(traveller?.name || "").trim(),
        sharing: normalizeSharing(traveller?.sharing),
        transport: String(traveller?.transport || traveller?.vehicle || "").trim(),
    }))
}

function buildGroupedPaymentBreakdown(lineItems: Array<{
    traveller_id: number
    sharing: string
    transport: string
    unit_price: number
}>): Array<{
    label: string
    count: number
    variant: string
    transport: string
    unit_price: number
    price: number
}> {
    const groups: Record<string, { count: number; variant: string; transport: string; unit_price: number }> = {}

    for (const item of lineItems || []) {
        const variant = String(item?.sharing || "").trim()
        const transport = String(item?.transport || "").trim()
        const unit = round2(toNumber(item?.unit_price))
        const key = `${variant}__${transport}__${unit}`

        if (!groups[key]) {
            groups[key] = {
                count: 0,
                variant,
                transport,
                unit_price: unit,
            }
        }
        groups[key].count += 1
    }

    return Object.values(groups).map((group) => ({
        label: `${group.count}x ${group.variant}${group.transport ? ` · ${group.transport}` : ""}`,
        count: group.count,
        variant: group.variant,
        transport: group.transport,
        unit_price: group.unit_price,
        price: round2(group.unit_price * group.count),
    }))
}

function buildPricingBreakdownFromQuote(source: any, fallback: PricingBreakdown): PricingBreakdown {
    const baseSubtotal = round2(
        Math.max(0, toNumber(source?.base_subtotal ?? source?.subtotal_amount ?? fallback.base_subtotal))
    )

    const earlyBirdDiscountAmount = round2(
        Math.max(
            0,
            toNumber(source?.early_bird_discount_amount ?? source?.earlyBirdDiscountAmount ?? fallback.early_bird_discount_amount)
        )
    )

    const couponDiscountAmount = round2(
        Math.max(
            0,
            toNumber(source?.coupon_discount_amount ?? source?.couponDiscountAmount ?? fallback.coupon_discount_amount)
        )
    )

    const discountAmountTotal = round2(
        Math.max(
            0,
            toNumber(source?.discount_amount_total ?? source?.discount_amount ?? source?.discountAmount ?? fallback.discount_amount_total)
        )
    )

    const appliedDiscountSource = (
        String(source?.applied_discount_source || source?.final_applied_source || fallback.applied_discount_source || "none")
            .trim()
            .toLowerCase()
    ) as PricingBreakdown["applied_discount_source"]

    const taxableAmount = round2(
        Math.max(
            0,
            toNumber(source?.taxable_amount ?? source?.taxableSubtotal ?? Math.max(0, baseSubtotal - discountAmountTotal))
        )
    )

    const fallbackTax = round2(taxableAmount * TAX_RATE)
    const taxAmount = round2(Math.max(0, toNumber(source?.tax_amount ?? source?.taxAmount ?? fallbackTax)))
    const totalAmount = round2(
        Math.max(
            0,
            toNumber(source?.total_amount ?? source?.totalAmount ?? taxableAmount + taxAmount)
        )
    )

    const appliedDiscountCode = String(
        source?.applied_discount_code || source?.code || fallback.applied_discount_code || ""
    )
        .trim()
        .toUpperCase()

    return {
        base_subtotal: baseSubtotal,
        early_bird_discount_amount: earlyBirdDiscountAmount,
        coupon_discount_amount: couponDiscountAmount,
        applied_discount_source: ["none", "early_bird", "coupon"].includes(appliedDiscountSource)
            ? appliedDiscountSource
            : fallback.applied_discount_source,
        applied_discount_code: appliedDiscountCode || null,
        discount_amount_total: discountAmountTotal,
        taxable_amount: taxableAmount,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        line_items: Array.isArray(source?.line_items) && source.line_items.length > 0 ? source.line_items : fallback.line_items,
    }
}

function buildLocalPricingBreakdown(params: {
    pricingRows: any[]
    departureDate: string
    travellers: TravellerResolved[]
    fallbackTransport: string
}) {
    const { pricingRows, departureDate, travellers, fallbackTransport } = params

    let subtotal = 0
    let earlyBirdDiscount = 0
    const lineItems: PricingBreakdown["line_items"] = []
    const resolvedTravellers: TravellerResolved[] = []

    const transportOptions = getTransportOptions(pricingRows, departureDate)
    const hasVehicleOptions = transportOptions.length > 1

    for (const traveller of travellers) {
        const resolvedTransport = hasVehicleOptions
            ? getDefaultTransportForDate(pricingRows, departureDate, traveller.transport || fallbackTransport)
            : ""

        const sharingOptions = getSharingOptions(pricingRows, departureDate, resolvedTransport)
        const resolvedSharing =
            traveller.sharing && sharingOptions.includes(traveller.sharing)
                ? traveller.sharing
                : getDefaultSharingForDate(pricingRows, departureDate, resolvedTransport)

        if (!resolvedSharing) {
            throw new Error(`Pricing variant missing for traveller ${traveller.id}`)
        }

        const pricingRow = resolvePricingRowForTraveller(
            pricingRows,
            departureDate,
            resolvedTransport,
            resolvedSharing
        )

        const unitPrice = round2(Math.max(0, toNumber(pricingRow?.price)))
        if (!pricingRow || unitPrice <= 0) {
            throw new Error(`Price unavailable for ${resolvedSharing}${resolvedTransport ? ` (${resolvedTransport})` : ""}`)
        }

        const normalizedTransport = getTransportValue(pricingRow) || resolvedTransport
        const normalizedName = String(traveller.name || "").trim() || `Traveller ${traveller.id}`

        subtotal += unitPrice
        earlyBirdDiscount += computeEarlyBirdDiscountForRow(pricingRow, unitPrice)

        lineItems.push({
            traveller_id: traveller.id,
            sharing: resolvedSharing,
            transport: normalizedTransport,
            unit_price: unitPrice,
        })

        resolvedTravellers.push({
            id: traveller.id,
            name: normalizedName,
            sharing: resolvedSharing,
            transport: normalizedTransport,
        })
    }

    const safeSubtotal = round2(Math.max(0, subtotal))
    const earlyDiscount = round2(Math.max(0, Math.min(earlyBirdDiscount, safeSubtotal)))
    const discountTotal = earlyDiscount
    const taxableAmount = round2(Math.max(0, safeSubtotal - discountTotal))
    const taxAmount = round2(taxableAmount * TAX_RATE)
    const totalAmount = round2(taxableAmount + taxAmount)

    const breakdown: PricingBreakdown = {
        base_subtotal: safeSubtotal,
        early_bird_discount_amount: earlyDiscount,
        coupon_discount_amount: 0,
        applied_discount_source: earlyDiscount > 0 ? "early_bird" : "none",
        applied_discount_code: null,
        discount_amount_total: discountTotal,
        taxable_amount: taxableAmount,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        line_items: lineItems,
    }

    return {
        travellers: resolvedTravellers,
        pricingBreakdown: breakdown,
    }
}

function isInviteOnlyTrip(pricingRows: any[]): boolean {
    const rows = Array.isArray(pricingRows) ? pricingRows : []
    if (rows.length === 0) return false
    const hasSharingRows = rows.some((row) => Boolean(getVariantValue(row)))
    return !hasSharingRows
}

async function readPayload(req: Request): Promise<any> {
    const contentType = String(req.headers.get("content-type") || "").toLowerCase()

    if (contentType.includes("application/json")) {
        return await req.json()
    }

    if (
        contentType.includes("application/x-www-form-urlencoded") ||
        contentType.includes("multipart/form-data")
    ) {
        const form = await req.formData()
        return {
            trip_id: form.get("trip_id"),
            date: form.get("date"),
            departure_date: form.get("departure_date"),
            transport: form.get("transport"),
            travellers: parseJsonField(form.get("travellers")) || [],
            payment_breakdown: parseJsonField(form.get("payment_breakdown")) || [],
            pricing_snapshot: parseJsonField(form.get("pricing_snapshot")) || null,
            coupon_snapshot: parseJsonField(form.get("coupon_snapshot")) || null,
            coupon_code: form.get("coupon_code"),
            tax_amount: form.get("tax_amount"),
            total_amount: form.get("total_amount"),
            subtotal_amount: form.get("subtotal_amount"),
            discount_amount: form.get("discount_amount"),
            payment_mode: form.get("payment_mode"),
            payable_now_amount: form.get("payable_now_amount"),
            due_amount: form.get("due_amount"),
            name: form.get("name"),
            email: form.get("email"),
            phone: form.get("phone"),
            currency: form.get("currency"),
        }
    }

    return await req.json()
}

async function fetchPricingRows(supabase: any, tripId: string): Promise<any[]> {
    const { data, error } = await supabase
        .from("trip_pricing")
        .select("*")
        .eq("trip_id", tripId)

    if (error) throw new Error(`Could not read trip pricing: ${error.message}`)
    return Array.isArray(data) ? data : []
}

async function validateCouponServerSide(params: {
    supabaseUrl: string
    functionAuthJwt: string
    apikey: string
    payload: Record<string, any>
}) {
    const endpoint = `${params.supabaseUrl}/functions/v1/validate-coupon`
    const response = await fetch(endpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            apikey: params.apikey,
            Authorization: `Bearer ${params.functionAuthJwt}`,
        },
        body: JSON.stringify(params.payload),
    })

    const data = await response.json().catch(() => ({}))
    if (!response.ok || !data?.valid) {
        const message = data?.message || data?.error || `Coupon validation failed (HTTP ${response.status})`
        throw new Error(String(message))
    }

    return data
}

function isLikelyJwt(value: string): boolean {
    const token = String(value || "").trim()
    if (!token) return false
    const parts = token.split(".")
    return parts.length === 3 && parts.every((segment) => segment.length > 0)
}

function extractBearerToken(authHeader: string | null): string {
    const raw = String(authHeader || "").trim()
    if (!raw) return ""
    const match = /^Bearer\s+(.+)$/i.exec(raw)
    return String(match?.[1] || "").trim()
}

function paymentModeSummary(paymentMode: PaymentMode, totalAmount: number) {
    const payableNowAmount = paymentMode === "partial_25" ? round2(totalAmount * 0.25) : round2(totalAmount)
    const dueAmount = round2(Math.max(0, totalAmount - payableNowAmount))
    return { payableNowAmount, dueAmount }
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders })
    }

    try {
        const body = await readPayload(req)
        console.log("📥 Incoming booking payload:", body)

        const tripId = firstNonEmpty(body?.trip_id)
        const departureDate = normalizeDateKey(firstNonEmpty(body?.departure_date, body?.date))
        const fallbackTransport = firstNonEmpty(body?.transport)
        const travellersInput = Array.isArray(body?.travellers) ? body.travellers : []

        const name = firstNonEmpty(body?.name)
        const email = firstNonEmpty(body?.email)
        const phone = firstNonEmpty(body?.phone)
        const currency = firstNonEmpty(body?.currency, "INR")
        const paymentMode = normalizePaymentMode(body?.payment_mode || body?.pricing_snapshot?.payment_mode)

        const couponCodeRaw = firstNonEmpty(body?.coupon_code, body?.pricing_snapshot?.applied_discount_code)
        const couponCodeRequested = couponCodeRaw ? couponCodeRaw.toUpperCase() : ""

        if (!tripId || !departureDate || !travellersInput.length || !name || !email) {
            return new Response(
                JSON.stringify({
                    error: "Missing required fields (trip_id, departure_date, travellers, name, email)",
                }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            )
        }

        const supabaseUrl = Deno.env.get("SUPABASE_URL") || ""
        const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
        const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || ""
        if (!supabaseUrl || !serviceRoleKey) {
            return new Response(
                JSON.stringify({ error: "Supabase configuration missing" }),
                { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            )
        }

        const incomingBearer = extractBearerToken(req.headers.get("authorization"))
        const incomingApikey = firstNonEmpty(req.headers.get("apikey"))

        const functionAuthJwt = isLikelyJwt(incomingBearer)
            ? incomingBearer
            : isLikelyJwt(serviceRoleKey)
                ? serviceRoleKey
            : isLikelyJwt(anonKey)
                ? anonKey
                : ""
        const functionApikey = firstNonEmpty(incomingApikey, anonKey, functionAuthJwt)
        if (!functionAuthJwt || !functionApikey) {
            return new Response(
                JSON.stringify({ error: "Supabase function auth JWT missing" }),
                { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            )
        }

        const isTest = Deno.env.get("PAYU_TEST_MODE") === "true"
        const payuKey = isTest
            ? Deno.env.get("PAYU_TEST_KEY") || Deno.env.get("PAYU_KEY")
            : Deno.env.get("PAYU_LIVE_KEY") || Deno.env.get("PAYU_KEY")
        const payuSalt = isTest
            ? Deno.env.get("PAYU_TEST_SALT") || Deno.env.get("PAYU_SALT")
            : Deno.env.get("PAYU_LIVE_SALT") || Deno.env.get("PAYU_SALT")

        if (!payuKey || !payuSalt) {
            return new Response(
                JSON.stringify({ error: "Payment configuration missing" }),
                { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            )
        }

        const supabase = createClient(supabaseUrl, serviceRoleKey)
        const pricingRows = await fetchPricingRows(supabase, tripId)

        if (!pricingRows.length) {
            return new Response(
                JSON.stringify({ error: "Pricing not configured for this trip" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            )
        }

        if (isInviteOnlyTrip(pricingRows)) {
            return new Response(
                JSON.stringify({ error: "This trip is invite-only and cannot be booked online" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            )
        }

        const normalizedTravellers = normalizeTravellers(travellersInput)
        const { travellers: resolvedTravellers, pricingBreakdown: baseBreakdown } = buildLocalPricingBreakdown({
            pricingRows,
            departureDate,
            travellers: normalizedTravellers,
            fallbackTransport,
        })

        let pricingBreakdown = baseBreakdown
        let couponSnapshot: any = null

        if (couponCodeRequested) {
            const couponPayload = {
                trip_id: tripId,
                departure_date: departureDate,
                transport: fallbackTransport || null,
                travellers: resolvedTravellers.map((traveller) => ({
                    id: traveller.id,
                    name: traveller.name,
                    sharing: traveller.sharing,
                    transport: traveller.transport,
                })),
                coupon_code: couponCodeRequested,
                email,
            }

            const couponQuote = await validateCouponServerSide({
                supabaseUrl,
                functionAuthJwt,
                apikey: functionApikey,
                payload: couponPayload,
            })

            pricingBreakdown = buildPricingBreakdownFromQuote(couponQuote, baseBreakdown)
            couponSnapshot = {
                ...couponQuote,
                validated_at: new Date().toISOString(),
                validated_by: "create-booking",
            }
        }

        const totalAmount = round2(Math.max(0, pricingBreakdown.total_amount))
        const subtotalAmount = round2(Math.max(0, pricingBreakdown.base_subtotal))
        const discountAmount = round2(Math.max(0, pricingBreakdown.discount_amount_total))
        const taxAmount = round2(Math.max(0, pricingBreakdown.tax_amount))

        const { payableNowAmount, dueAmount } = paymentModeSummary(paymentMode, totalAmount)
        if (totalAmount <= 0 || payableNowAmount <= 0) {
            return new Response(
                JSON.stringify({ error: "Total amount must be greater than zero" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            )
        }

        const paymentBreakdown = buildGroupedPaymentBreakdown(pricingBreakdown.line_items)
        const txnid = "txn_" + Date.now().toString().slice(-10) + Math.floor(Math.random() * 10000)

        const initialPaidAmount = 0
        const settlementStatus = "pending"
        const balanceDueNote =
            paymentMode === "partial_25" && dueAmount > 0
                ? `₹${dueAmount.toLocaleString("en-IN")} due on-site before trip departure.`
                : null

        const couponCode =
            String(pricingBreakdown.applied_discount_code || couponCodeRequested || "").trim().toUpperCase() || null

        const insertPayload: Record<string, any> = {
            trip_id: tripId,
            departure_date: departureDate,
            transport: fallbackTransport || resolvedTravellers[0]?.transport || null,
            travellers: resolvedTravellers,
            payment_breakdown: paymentBreakdown,
            subtotal_amount: subtotalAmount,
            discount_amount: discountAmount,
            coupon_code: couponCode,
            coupon_snapshot: couponSnapshot,
            tax_amount: taxAmount,
            total_amount: totalAmount,
            currency,
            payment_status: "pending",
            payment_mode: paymentMode,
            payable_now_amount: payableNowAmount,
            paid_amount: initialPaidAmount,
            due_amount: dueAmount,
            settlement_status: settlementStatus,
            balance_due_note: balanceDueNote,
            name,
            email,
            phone: phone || "",
            payu_txnid: txnid,
        }

        let { data, error } = await supabase
            .from("bookings")
            .insert(insertPayload)
            .select("*")
            .single()

        if (error && isMissingColumnError(error, "balance_due_note")) {
            const fallbackInsertPayload = { ...insertPayload }
            delete fallbackInsertPayload.balance_due_note
            const fallback = await supabase
                .from("bookings")
                .insert(fallbackInsertPayload)
                .select("*")
                .single()
            data = fallback.data
            error = fallback.error
        }

        if (error || !data) {
            console.error("❌ Supabase insert error:", error)
            return new Response(
                JSON.stringify({ error: error?.message || "Could not create booking" }),
                { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            )
        }

        const bookingsSheetId = firstNonEmpty(
            Deno.env.get("GOOGLE_SHEET_ID_TRIPS"),
            Deno.env.get("GOOGLE_SHEET_ID")
        )
        const bookingsSheetTab = firstNonEmpty(Deno.env.get("BOOKINGS_SHEET_TAB"), "Bookings")
        if (bookingLifecycleSheetsWriteEnabled() && sheetsEnabled() && bookingsSheetId) {
            try {
                const rowValues = buildBookingSheetRow({
                    booking: {
                        ...data,
                        balance_due_note: (data as any)?.balance_due_note ?? balanceDueNote,
                    },
                    eventStage: "created",
                    notes: "Booking initiated; awaiting payment callback.",
                })
                await appendRow(bookingsSheetId, bookingsSheetTab, rowValues, BOOKING_HEADERS)
            } catch (sheetErr) {
                console.error("[create-booking] sheets append failed", sheetErr)
            }
        } else if (bookingSheetsWriteEnabled() && sheetsEnabled() && bookingsSheetId) {
            console.log(
                "[create-booking] lifecycle sheet write skipped (BOOKING_LIFECYCLE_SHEETS_WRITE_ENABLED is false)"
            )
        }

        const productinfo = "Trip Booking"
        const firstname = name.split(" ")[0]
        const udf1 = data.id
        const gatewayAmount = payableNowAmount.toFixed(2)

        const hashString = `${payuKey}|${txnid}|${gatewayAmount}|${productinfo}|${firstname}|${email}|${udf1}||||||||||${payuSalt}`
        const hashBuffer = await crypto.subtle.digest("SHA-512", new TextEncoder().encode(hashString))
        const hash = Array.from(new Uint8Array(hashBuffer))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("")

        const actionUrl = isTest ? "https://test.payu.in/_payment" : "https://secure.payu.in/_payment"
        const callbackUrl =
            Deno.env.get("PAYMENT_CALLBACK_URL") ||
            `${Deno.env.get("SUPABASE_URL")}/functions/v1/handle-payment`

        return new Response(
            JSON.stringify({
                booking_id: data.id,
                payment_mode: paymentMode,
                total_amount: totalAmount,
                payable_now_amount: payableNowAmount,
                due_amount: dueAmount,
                settlement_status: settlementStatus,
                payu: {
                    key: payuKey,
                    txnid,
                    amount: gatewayAmount,
                    productinfo,
                    firstname,
                    email,
                    phone: phone || "",
                    surl: callbackUrl,
                    furl: callbackUrl,
                    hash,
                    udf1,
                    action: actionUrl,
                },
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
    } catch (err: any) {
        console.error("💥 create-booking error:", err)
        const message = String(err?.message || "Internal server error")
        const status = /pricing|coupon|trip|traveller/i.test(message) ? 400 : 500
        return new Response(
            JSON.stringify({ error: message || "Internal server error" }),
            { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
    }
})
