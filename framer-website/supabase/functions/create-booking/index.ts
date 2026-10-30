import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { buildBookingSheetRow, BOOKING_HEADERS } from "../_shared/booking_sheets.ts"
import {
    issueBookingStatusToken,
    resolveBookingStatusSecret,
} from "../_shared/booking_status_token.ts"
import {
    buildPaymentAttemptInsert,
    expectedBookingPaymentAmountMinor,
    fingerprintBookingRequest,
    isCompatibleIdempotentReplay,
    normalizeIdempotencyKey,
} from "../_shared/payment_idempotency.ts"
import {
    computeBasePricing,
    normalizeTravellers as normalizePricingTravellers,
} from "../_shared/pricing.ts"
import {
    buildWebsiteCommercialSnapshot,
    loadWebsiteTripCatalogPricing,
    resolveWebsiteFinanceIssuer,
    validateWebsiteDepartureSelection,
} from "../_shared/crm_trip_catalog.ts"
import { buildWebsiteBillingSnapshot, calculateWebsiteBookingTotals } from "../../../framer/booking-tax.ts"
import {
    createRazorpayOrder,
    paymentCallbackUrl,
    razorpayCredentials,
} from "../_shared/razorpay.ts"
import { sheetsEnabled, upsertCurrentRow } from "../_shared/sheets.ts"
import {
    deliverInternalBookingNotification,
} from "../_shared/internal_booking_notifications.ts"
import { buildInternalNotificationEventKey } from "../_shared/internal_booking_email.ts"
import type { PaymentEmailBooking } from "../_shared/payment_email.ts"

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function responseJson(payload: Record<string, unknown>, status = 200): Response {
    return new Response(JSON.stringify(payload), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status,
    })
}

type PaymentMode = "full" | "partial_25"
type SharingValue = "Quad" | "Triple" | "Double" | "Single" | ""

type TravellerInput = {
    id?: number
    name?: string
    gender?: string
    sharing?: string
    transport?: string
    vehicle?: string
}

type TravellerResolved = {
    id: number
    name: string
    gender: string
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
    gst_amount: number
    tcs_basis: number
    tcs_amount: number
    finance_issuer: "TWN" | "NTC"
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

function isUniqueViolation(error: any): boolean {
    return String(error?.code || "").trim() === "23505"
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
    if (lower.includes("single")) return "Single"
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

function todayISTDateKey(): string {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(new Date())
    const get = (type: string) => parts.find((part) => part.type === type)?.value || ""
    return `${get("year")}-${get("month")}-${get("day")}`
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
            .filter((value: SharingValue) => Boolean(value))
    )

    const ordered: SharingValue[] = []
    if (set.has("Quad")) ordered.push("Quad")
    if (set.has("Triple")) ordered.push("Triple")
    if (set.has("Double")) ordered.push("Double")
    if (set.has("Single")) ordered.push("Single")
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
        gender: String(traveller?.gender || "").trim(),
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

    const taxableAmount = round2(Math.max(0, toNumber(source?.taxable_amount ?? source?.taxableSubtotal ?? baseSubtotal)))
    const financeIssuer: "TWN" | "NTC" = source?.finance_issuer === "NTC" || fallback.finance_issuer === "NTC"
        ? "NTC"
        : "TWN"
    const billingTotals = calculateWebsiteBookingTotals({
        issuer: financeIssuer,
        taxableAmount,
        discountAmount: discountAmountTotal,
    })
    const taxAmount = billingTotals.taxAmount
    const totalAmount = billingTotals.totalAmount

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
        gst_amount: billingTotals.gstAmount,
        tcs_basis: billingTotals.tcsBasis,
        tcs_amount: billingTotals.tcsAmount,
        finance_issuer: financeIssuer,
        total_amount: totalAmount,
        line_items: Array.isArray(source?.line_items) && source.line_items.length > 0 ? source.line_items : fallback.line_items,
    }
}

function buildLocalPricingBreakdown(params: {
    pricingRows: any[]
    departureDate: string
    travellers: TravellerResolved[]
    fallbackTransport: string
    issuer?: "TWN" | "NTC"
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
            gender: String(traveller.gender || "").trim(),
            sharing: resolvedSharing,
            transport: normalizedTransport,
        })
    }

    const safeSubtotal = round2(Math.max(0, subtotal))
    const earlyDiscount = round2(Math.max(0, Math.min(earlyBirdDiscount, safeSubtotal)))
    const discountTotal = earlyDiscount
    const billingTotals = calculateWebsiteBookingTotals({
        issuer: params.issuer || "TWN",
        taxableAmount: safeSubtotal,
        discountAmount: discountTotal,
    })

    const breakdown: PricingBreakdown = {
        base_subtotal: safeSubtotal,
        early_bird_discount_amount: earlyDiscount,
        coupon_discount_amount: 0,
        applied_discount_source: earlyDiscount > 0 ? "early_bird" : "none",
        applied_discount_code: null,
        discount_amount_total: discountTotal,
        taxable_amount: billingTotals.taxableAmount,
        tax_amount: billingTotals.taxAmount,
        gst_amount: billingTotals.gstAmount,
        tcs_basis: billingTotals.tcsBasis,
        tcs_amount: billingTotals.tcsAmount,
        finance_issuer: billingTotals.issuer,
        total_amount: billingTotals.totalAmount,
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
            checkout_request_id: form.get("checkout_request_id") || form.get("idempotency_key"),
            trip_id: form.get("trip_id"),
            trip_slug: form.get("trip_slug"),
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

    let notificationCheckoutRequestId = ""
    let notificationBooking: PaymentEmailBooking | null = null
    let notificationAttempt: Record<string, unknown> | null = null
    let notificationSupabase: any = null

    try {
        const body = await readPayload(req)

        const rawCheckoutRequestId = firstNonEmpty(
            body?.checkout_request_id,
            req.headers.get("idempotency-key"),
        )
        let checkoutRequestId = ""
        try {
            checkoutRequestId = normalizeIdempotencyKey(rawCheckoutRequestId, "checkout_request_id")
        } catch (error: any) {
            return new Response(
                JSON.stringify({ error: error?.message || "checkout_request_id is required" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            )
        }
        notificationCheckoutRequestId = checkoutRequestId

        let tripId = firstNonEmpty(body?.trip_id)
        const tripSlug = firstNonEmpty(body?.trip_slug)
        const departureDate = normalizeDateKey(firstNonEmpty(body?.departure_date, body?.date))
        const fallbackTransport = firstNonEmpty(body?.transport)
        const travellersInput = Array.isArray(body?.travellers) ? body.travellers : []

        const name = firstNonEmpty(body?.name)
        const email = firstNonEmpty(body?.email).toLowerCase()
        const phone = firstNonEmpty(body?.phone)
        const currency = firstNonEmpty(body?.currency, "INR")
        const paymentMode = normalizePaymentMode(body?.payment_mode || body?.pricing_snapshot?.payment_mode)

        const couponCodeRaw = firstNonEmpty(body?.coupon_code, body?.pricing_snapshot?.applied_discount_code)
        const couponCodeRequested = couponCodeRaw ? couponCodeRaw.toUpperCase() : ""

        if (!tripId || !departureDate || !travellersInput.length || !name || !email) {
            return new Response(
                JSON.stringify({
                    error: "Missing required fields (trip_id, departure_date, travellers, name, email, checkout_request_id)",
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

        const supabase = createClient(supabaseUrl, serviceRoleKey)
        notificationSupabase = supabase
        if (tripSlug) {
            const tripBySlug = await supabase
                .from("trips")
                .select("id, slug")
                .eq("slug", tripSlug)
                .maybeSingle()
            if (tripBySlug.error) throw tripBySlug.error
            if (tripBySlug.data?.id && String(tripBySlug.data.id) !== tripId) {
                console.warn("[create-booking] canonicalizing trip ID from slug", {
                    supplied_trip_id: tripId,
                    trip_slug: tripSlug,
                    canonical_trip_id: tripBySlug.data.id,
                })
                tripId = String(tripBySlug.data.id)
            }
        }
        console.log("[create-booking] request received", {
            checkout_request_id: checkoutRequestId,
            trip_id: tripId,
            departure_date: departureDate,
        })
        const canonicalTravellers = normalizePricingTravellers(travellersInput)
        const checkoutRequestFingerprint = await fingerprintBookingRequest({
            trip_id: tripId,
            departure_date: departureDate,
            transport: fallbackTransport,
            travellers: canonicalTravellers,
            name,
            email,
            phone,
            currency: currency.toUpperCase(),
            payment_mode: paymentMode,
            coupon_code: couponCodeRequested,
        })

        const preflightLookup = await supabase
            .from("bookings")
            .select("*")
            .eq("checkout_request_id", checkoutRequestId)
            .maybeSingle()
        if (preflightLookup.error) {
            return new Response(
                JSON.stringify({ error: preflightLookup.error.message || "Could not check checkout request" }),
                { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            )
        }
        const existingBooking = preflightLookup.data || null
        let replayed = Boolean(existingBooking)
        if (existingBooking && !isCompatibleIdempotentReplay(existingBooking.checkout_request_fingerprint, checkoutRequestFingerprint)) {
            return new Response(
                JSON.stringify({
                    error: "checkout_request_id was already used with different booking data",
                    code: "IDEMPOTENCY_CONFLICT",
                }),
                { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            )
        }

        if (!existingBooking && canonicalTravellers.some((traveller) => !traveller.name)) {
            return new Response(
                JSON.stringify({ error: "Enter a name for every traveller" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            )
        }

        let data: any = existingBooking
        let crmTripCatalogId = ""
        let crmTripNameSnapshot = ""
        let billingIssuer: "TWN" | "NTC" | null = null
        let billingSnapshot: any = null
        let commercialSnapshot: any = null
        let resolvedTravellers: TravellerResolved[]
        let pricingBreakdown: PricingBreakdown
        let couponSnapshot: any = null
        let totalAmount: number
        let subtotalAmount: number
        let discountAmount: number
        let taxAmount: number
        let payableNowAmount: number
        let dueAmount: number
        let paymentBreakdown: any[]

        if (existingBooking) {
            const storedTravellers = normalizePricingTravellers(
                Array.isArray(existingBooking.travellers) ? existingBooking.travellers : [],
            )
            resolvedTravellers = storedTravellers.map((traveller) => ({
                id: Number(traveller.id),
                name: firstNonEmpty(traveller.name, `Traveller ${traveller.id}`),
                gender: String(traveller.gender || "").trim(),
                sharing: normalizeSharing(traveller.sharing),
                transport: String(traveller.transport || "").trim(),
            }))
            paymentBreakdown = Array.isArray(existingBooking.payment_breakdown)
                ? existingBooking.payment_breakdown
                : []
            const storedLineItems = resolvedTravellers.map((traveller) => ({
                traveller_id: traveller.id,
                sharing: traveller.sharing,
                transport: traveller.transport,
                unit_price: 0,
            }))
            subtotalAmount = round2(toNumber(existingBooking.subtotal_amount))
            discountAmount = round2(toNumber(existingBooking.discount_amount))
            taxAmount = round2(toNumber(existingBooking.tax_amount))
            totalAmount = round2(toNumber(existingBooking.total_amount))
            payableNowAmount = round2(toNumber(existingBooking.payable_now_amount))
            dueAmount = round2(toNumber(existingBooking.due_amount))
            couponSnapshot = existingBooking.coupon_snapshot || null
            pricingBreakdown = {
                base_subtotal: subtotalAmount,
                early_bird_discount_amount: 0,
                coupon_discount_amount: discountAmount,
                applied_discount_source: existingBooking.coupon_code ? "coupon" : "none",
                applied_discount_code: existingBooking.coupon_code || null,
                discount_amount_total: discountAmount,
                taxable_amount: round2(Math.max(0, subtotalAmount - discountAmount)),
                tax_amount: taxAmount,
                gst_amount: Number(existingBooking.gst_amount || taxAmount),
                tcs_basis: Number(existingBooking.tcs_basis || 0),
                tcs_amount: Number(existingBooking.tcs_amount || 0),
                finance_issuer: existingBooking.finance_issuer === "NTC" ? "NTC" : "TWN",
                total_amount: totalAmount,
                line_items: storedLineItems,
            }
        } else {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(departureDate) || departureDate < todayISTDateKey()) {
                return new Response(
                    JSON.stringify({ error: "Departure date is unavailable or already past" }),
                    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
                )
            }
            const { data: publicTrip, error: publicTripError } = await supabase
                .from("trips")
                .select("id, active")
                .eq("id", tripId)
                .maybeSingle()
            if (publicTripError) throw new Error(`Could not confirm this trip: ${publicTripError.message}`)
            if (!publicTrip?.id || publicTrip.active !== true) {
                return new Response(
                    JSON.stringify({ error: "This trip is not available for online booking" }),
                    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
                )
            }

            const catalogPricing = await loadWebsiteTripCatalogPricing(tripId)
            if (!catalogPricing) {
                return new Response(
                    JSON.stringify({ error: "Operations has not opened this trip for online bookings" }),
                    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
                )
            }
            const pricingRows = catalogPricing.pricingRows
            crmTripCatalogId = catalogPricing.catalogTrip.id
            crmTripNameSnapshot = catalogPricing.catalogTrip.title
            billingIssuer = resolveWebsiteFinanceIssuer(catalogPricing.catalogTrip)
            if (!billingIssuer) {
                return new Response(
                    JSON.stringify({ error: "Trip billing details are incomplete" }),
                    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
                )
            }

            if (!pricingRows.length) {
                return new Response(
                    JSON.stringify({ error: "No open departures are available for this trip" }),
                    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
                )
            }

            const departureSelection = validateWebsiteDepartureSelection(
                pricingRows,
                departureDate,
                canonicalTravellers.length,
            )
            if (!departureSelection.valid) {
                const messages = {
                    invalid_passengers: "Add between 1 and 50 travellers before booking",
                    unavailable: "The selected departure is no longer available",
                    ambiguous: "This departure needs an Operations update before it can be booked",
                    capacity: "There are not enough seats left for this group",
                }
                return new Response(
                    JSON.stringify({ error: messages[departureSelection.reason] }),
                    { status: departureSelection.reason === "unavailable" ? 400 : 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
                )
            }

            if (isInviteOnlyTrip(pricingRows)) {
                return new Response(
                    JSON.stringify({ error: "This trip is invite-only and cannot be booked online" }),
                    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
                )
            }

            const basePricing = computeBasePricing({
                pricingRows,
                departureDate,
                fallbackTransport,
                travellers: canonicalTravellers,
            })
            if (basePricing.missingSharings.length > 0 || basePricing.lineItems.length !== canonicalTravellers.length) {
                throw new Error("Pricing variant or traveller combination is unavailable")
            }
            commercialSnapshot = buildWebsiteCommercialSnapshot({
                departureDate,
                lineItems: basePricing.lineItems,
                pricingRows,
            })
            if (!commercialSnapshot) {
                return new Response(
                    JSON.stringify({ error: "The selected Operations prices changed. Refresh checkout and try again." }),
                    { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
                )
            }
            resolvedTravellers = basePricing.lineItems.map((item) => {
                const source = canonicalTravellers.find((traveller) => Number(traveller.id) === Number(item.traveller_id))
                return {
                    id: Number(item.traveller_id),
                    name: firstNonEmpty(source?.name, `Traveller ${item.traveller_id}`),
                    gender: String(source?.gender || "").trim(),
                    sharing: normalizeSharing(item.sharing),
                    transport: String(item.transport || "").trim(),
                }
            })
            const baseTotals = calculateWebsiteBookingTotals({
                issuer: billingIssuer,
                taxableAmount: basePricing.subtotal,
                discountAmount: basePricing.earlyBirdDiscountAmount,
            })
            const baseBreakdown: PricingBreakdown = {
                base_subtotal: round2(basePricing.subtotal),
                early_bird_discount_amount: round2(basePricing.earlyBirdDiscountAmount),
                coupon_discount_amount: 0,
                applied_discount_source: basePricing.earlyBirdDiscountAmount > 0 ? "early_bird" : "none",
                applied_discount_code: null,
                discount_amount_total: round2(basePricing.earlyBirdDiscountAmount),
                taxable_amount: baseTotals.taxableAmount,
                tax_amount: baseTotals.taxAmount,
                gst_amount: baseTotals.gstAmount,
                tcs_basis: baseTotals.tcsBasis,
                tcs_amount: baseTotals.tcsAmount,
                finance_issuer: billingIssuer,
                total_amount: baseTotals.totalAmount,
                line_items: basePricing.lineItems.map((item) => ({
                    traveller_id: Number(item.traveller_id),
                    sharing: String(item.sharing),
                    transport: String(item.transport || ""),
                    unit_price: round2(toNumber(item.unit_price)),
                })),
            }

            pricingBreakdown = baseBreakdown
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

                if (
                    round2(toNumber(couponQuote.base_subtotal)) !== baseBreakdown.base_subtotal ||
                    couponQuote.finance_issuer !== billingIssuer ||
                    JSON.stringify(couponQuote.line_items || []) !== JSON.stringify(baseBreakdown.line_items)
                ) {
                    return new Response(
                        JSON.stringify({ error: "Trip prices changed while checkout was open. Refresh and try again." }),
                        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
                    )
                }

                pricingBreakdown = buildPricingBreakdownFromQuote(couponQuote, baseBreakdown)
                couponSnapshot = {
                    ...couponQuote,
                    validated_at: new Date().toISOString(),
                    validated_by: "create-booking",
                }
            }

            totalAmount = round2(Math.max(0, pricingBreakdown.total_amount))
            subtotalAmount = round2(Math.max(0, pricingBreakdown.base_subtotal))
            discountAmount = round2(Math.max(0, pricingBreakdown.discount_amount_total))
            taxAmount = round2(Math.max(0, pricingBreakdown.tax_amount))

            billingSnapshot = buildWebsiteBillingSnapshot({
                issuer: billingIssuer!,
                taxableAmount: subtotalAmount,
                discountAmount,
                currency,
            })
            if (
                billingSnapshot.totalAmountMinor !== Math.round(totalAmount * 100) ||
                billingSnapshot.gstAmountMinor + billingSnapshot.tcsAmountMinor !== Math.round(taxAmount * 100)
            ) {
                return new Response(
                    JSON.stringify({ error: "Trip billing totals changed. Refresh checkout before paying." }),
                    { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
                )
            }

            const payable = paymentModeSummary(paymentMode, totalAmount)
            payableNowAmount = payable.payableNowAmount
            dueAmount = payable.dueAmount
            if (totalAmount <= 0 || payableNowAmount <= 0) {
                return new Response(
                    JSON.stringify({ error: "Total amount must be greater than zero" }),
                    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
                )
            }
            paymentBreakdown = buildGroupedPaymentBreakdown(pricingBreakdown.line_items)
        }

        const paymentProvider = firstNonEmpty(
            data?.payment_provider,
            Deno.env.get("PAYMENT_PROVIDER"),
            "razorpay",
        ).toLowerCase()
        if (paymentProvider !== "razorpay") {
            return new Response(
                JSON.stringify({
                    error: `Unsupported payment provider: ${paymentProvider}`,
                    code: "PAYMENT_PROVIDER_UNSUPPORTED",
                }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            )
        }

        const initialPaidAmount = 0
        const settlementStatus = "pending"
        const balanceDueNote =
            paymentMode === "partial_25" && dueAmount > 0
                ? `₹${dueAmount.toLocaleString("en-IN")} due on-site before trip departure.`
                : null

        const couponCode = pricingBreakdown.applied_discount_source === "coupon"
            ? String(pricingBreakdown.applied_discount_code || couponCodeRequested || "").trim().toUpperCase() || null
            : null
        const crmCouponSnapshot = couponCode
            ? {
                code: couponCode,
                discount_amount_minor: Math.round(pricingBreakdown.coupon_discount_amount * 100),
            }
            : null
        if (commercialSnapshot) {
            commercialSnapshot = {
                ...commercialSnapshot,
                applied_discount: {
                    source: pricingBreakdown.applied_discount_source,
                    code: couponCode,
                    amount_minor: Math.round(discountAmount * 100),
                },
                coupon_snapshot: crmCouponSnapshot,
            }
        }

        const insertPayload: Record<string, any> = {
            trip_id: tripId,
            departure_date: departureDate,
            transport: fallbackTransport || resolvedTravellers[0]?.transport || null,
            travellers: resolvedTravellers,
            payment_breakdown: paymentBreakdown,
            subtotal_amount: subtotalAmount,
            discount_amount: discountAmount,
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
            status: "pending_payment",
            amount_inr: Math.round(totalAmount),
            checkout_request_id: checkoutRequestId,
            checkout_request_fingerprint: checkoutRequestFingerprint,
        }

        let error: any = null

        if (!data) {
            const bookingWrite = await supabase.schema("crm").rpc("create_booking_draft", {
                p_request_key: checkoutRequestId,
                p_booking: insertPayload,
                p_details: {
                    request_key: checkoutRequestId,
                    lead_id: null,
                    sales_owner_id: null,
                    trip_catalog_id: crmTripCatalogId,
                    trip_name_snapshot: crmTripNameSnapshot,
                    finance_issuer: billingIssuer,
                    billing_snapshot: billingSnapshot,
                    commercial_snapshot: commercialSnapshot,
                    agreed_advance_amount_minor: null,
                    booking_status: "payment_pending",
                },
            })
            const createdBooking = Array.isArray(bookingWrite.data)
                ? bookingWrite.data[0]
                : bookingWrite.data
            error = bookingWrite.error || null

            if (!error && createdBooking?.created_booking_id) {
                const bookingLookup = await supabase
                    .from("bookings")
                    .select("*")
                    .eq("id", createdBooking.created_booking_id)
                    .single()
                data = bookingLookup.data
                error = bookingLookup.error
            } else if (!error) {
                error = new Error("CRM booking service did not return a booking")
            }
        }

        if (error && isUniqueViolation(error)) {
            const concurrentLookup = await supabase
                .from("bookings")
                .select("*")
                .eq("checkout_request_id", checkoutRequestId)
                .maybeSingle()
            data = concurrentLookup.data
            error = concurrentLookup.error
            replayed = Boolean(data)
            if (data && !isCompatibleIdempotentReplay(data.checkout_request_fingerprint, checkoutRequestFingerprint)) {
                return new Response(
                    JSON.stringify({
                        error: "checkout_request_id was already used with different booking data",
                        code: "IDEMPOTENCY_CONFLICT",
                    }),
                    { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
                )
            }
        }

        if (error || !data) {
            console.error("❌ Supabase insert error:", error)
            return new Response(
                JSON.stringify({ error: error?.message || "Could not create booking" }),
                { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            )
        }

        let couponCodeToPersist = couponCode || firstNonEmpty(existingBooking?.coupon_code).toUpperCase() || null
        let couponSnapshotToPersist = couponCodeToPersist
            ? couponSnapshot || existingBooking?.coupon_snapshot || crmCouponSnapshot
            : null

        // The CRM RPC stores the applied coupon in its commercial snapshot first.
        // A retry can restore these established website fields if the compatibility
        // write failed after the atomic booking transaction.
        if (existingBooking && !couponCodeToPersist) {
            const detailsLookup = await supabase
                .schema("crm")
                .from("booking_details")
                .select("commercial_snapshot")
                .eq("booking_id", data.id)
                .maybeSingle()
            if (detailsLookup.error) {
                return new Response(
                    JSON.stringify({ error: detailsLookup.error.message || "Could not restore booking discount" }),
                    { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
                )
            }

            const commercial = detailsLookup.data?.commercial_snapshot
            const appliedDiscount = commercial?.applied_discount
            const storedCode = firstNonEmpty(appliedDiscount?.code)
            if (appliedDiscount?.source === "coupon" && storedCode) {
                couponCodeToPersist = storedCode.toUpperCase()
                couponSnapshotToPersist = commercial?.coupon_snapshot || {
                    code: couponCodeToPersist,
                    discount_amount_minor: appliedDiscount.amount_minor,
                }
            }
        }

        if (couponCodeToPersist) {
            const couponCompatibilityPayload = {
                coupon_code: couponCodeToPersist,
                coupon_snapshot: couponSnapshotToPersist,
            }
            if (!data.updated_at) {
                return responseJson({
                    error: "The booking changed while checkout was open. Refresh checkout before trying again.",
                    code: "BOOKING_PRICE_CHANGED",
                }, 409)
            }
            const couponCompatibilityWrite = await supabase
                .from("bookings")
                .update(couponCompatibilityPayload)
                .eq("id", data.id)
                .eq("updated_at", data.updated_at)
                .select("*")
                .maybeSingle()
            if (couponCompatibilityWrite.error) {
                return new Response(
                    JSON.stringify({ error: couponCompatibilityWrite.error.message || "Could not save the applied coupon" }),
                    { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
                )
            }
            if (!couponCompatibilityWrite.data) {
                return responseJson({
                    error: "The booking changed while checkout was open. Refresh checkout before trying again.",
                    code: "BOOKING_PRICE_CHANGED",
                }, 409)
            }
            data = couponCompatibilityWrite.data
        }

        const latestAttemptLookup = await supabase
            .from("payment_attempts")
            .select("*")
            .eq("booking_id", data.id)
            .order("attempt_no", { ascending: false })
            .limit(1)
        if (latestAttemptLookup.error) {
            return new Response(
                JSON.stringify({ error: latestAttemptLookup.error.message || "Could not read payment attempt" }),
                { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            )
        }

        let paymentAttempt = Array.isArray(latestAttemptLookup.data) ? latestAttemptLookup.data[0] : null
        const currentBookingPaymentAmountMinor = expectedBookingPaymentAmountMinor(data)
        if (currentBookingPaymentAmountMinor === null) {
            return responseJson({
                error: "The booking payment amount could not be confirmed. Refresh checkout before trying again.",
                code: "BOOKING_AMOUNT_UNAVAILABLE",
            }, 409)
        }
        if (paymentAttempt && Number(paymentAttempt.amount_minor) !== currentBookingPaymentAmountMinor) {
            return responseJson({
                error: "The booking price changed after this checkout started. Refresh checkout before trying again.",
                code: "BOOKING_PRICE_CHANGED",
            }, 409)
        }

        if (!paymentAttempt) {
            const attemptPayload = buildPaymentAttemptInsert({
                bookingId: data.id,
                attemptNo: 1,
                idempotencyKey: checkoutRequestId,
                provider: paymentProvider,
                amount: payableNowAmount,
                currency,
                status: "pending",
            })
            attemptPayload.expires_at = new Date(Date.now() + 30 * 60 * 1000).toISOString()

            if (Number(attemptPayload.amount_minor) !== currentBookingPaymentAmountMinor || !data.updated_at) {
                return new Response(
                    JSON.stringify({
                        error: "The booking price changed after this checkout started. Refresh checkout before trying again.",
                        code: "BOOKING_PRICE_CHANGED",
                    }),
                    { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
                )
            }

            const reservation = await supabase.schema("crm").rpc("reserve_website_booking_payment_attempt", {
                p_booking_id: data.id,
                p_idempotency_key: attemptPayload.idempotency_key,
                p_expected_booking_updated_at: data.updated_at,
                p_attempt_no: attemptPayload.attempt_no,
                p_provider: attemptPayload.provider,
                p_amount_minor: attemptPayload.amount_minor,
                p_currency: attemptPayload.currency,
                p_status: attemptPayload.status,
                p_expires_at: attemptPayload.expires_at,
            })
            const reservationRow = Array.isArray(reservation.data) ? reservation.data[0] : reservation.data
            if (reservation.error || !reservationRow?.payment_attempt) {
                const message = reservation.error?.message || "Could not reserve this payment attempt"
                const sqlState = reservation.error?.code
                const conflict = ["40001", "23505", "23514"].includes(sqlState)
                const code = sqlState === "40001"
                    ? "BOOKING_PRICE_CHANGED"
                    : sqlState === "23505"
                        ? "IDEMPOTENCY_CONFLICT"
                        : sqlState === "23514"
                            ? "PAYMENT_ATTEMPT_CONFLICT"
                            : "PAYMENT_ATTEMPT_RESERVATION_FAILED"
                return responseJson({
                    error: message,
                    code,
                }, conflict ? 409 : 500)
            }
            paymentAttempt = reservationRow.payment_attempt
            replayed = replayed || reservationRow.replayed === true
        }
        notificationBooking = {
            ...data,
            active_payment_attempt_id: paymentAttempt.id,
            payment_attempt_number: paymentAttempt.attempt_no || 1,
            payment_provider: paymentAttempt.provider || paymentProvider,
        }
        notificationAttempt = paymentAttempt

        const bookingsSheetId = firstNonEmpty(
            Deno.env.get("BOOKING_CALLBACK_SHEET_ID"),
            Deno.env.get("GOOGLE_SHEET_ID")
        )
        const bookingsSheetTab = firstNonEmpty(Deno.env.get("BOOKINGS_SHEET_TAB"), "Bookings")
        if (!replayed && bookingLifecycleSheetsWriteEnabled() && sheetsEnabled() && bookingsSheetId) {
            try {
                const rowValues = buildBookingSheetRow({
                    booking: {
                        ...data,
                        balance_due_note: (data as any)?.balance_due_note ?? balanceDueNote,
                    },
                    eventStage: "created",
                    notes: "Booking initiated; awaiting payment callback.",
                })
                await upsertCurrentRow(
                    bookingsSheetId,
                    bookingsSheetTab,
                    "Booking Ref",
                    String(data.booking_ref || data.id || ""),
                    rowValues,
                    BOOKING_HEADERS,
                )
            } catch (sheetErr) {
                console.error("[create-booking] sheets append failed", sheetErr)
            }
        } else if (!replayed && bookingSheetsWriteEnabled() && sheetsEnabled() && bookingsSheetId) {
            console.log(
                "[create-booking] lifecycle sheet write skipped (BOOKING_LIFECYCLE_SHEETS_WRITE_ENABLED is false)"
            )
        }

        const effectivePayableNowAmount = round2(Math.max(0, toNumber(data.payable_now_amount || payableNowAmount)))
        const activeProvider = firstNonEmpty(paymentAttempt.provider, paymentProvider).toLowerCase()
        if (activeProvider !== "razorpay") {
            return new Response(
                JSON.stringify({
                    error: `Unsupported payment provider: ${activeProvider}`,
                    code: "PAYMENT_PROVIDER_UNSUPPORTED",
                }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            )
        }
        const bookingStatusSecret = resolveBookingStatusSecret(firstNonEmpty(
            Deno.env.get("PAYMENT_STATUS_SECRET"),
            Deno.env.get("RAZORPAY_LIVE_KEY_SECRET"),
            Deno.env.get("RAZORPAY_TEST_KEY_SECRET"),
            Deno.env.get("RAZORPAY_KEY_SECRET"),
        ))
        const bookingStatusToken = bookingStatusSecret
            ? await issueBookingStatusToken(data.id, bookingStatusSecret)
            : null

        const responsePayload: Record<string, any> = {
            booking_id: data.id,
            checkout_request_id: checkoutRequestId,
            replayed,
            attempt_id: paymentAttempt.id,
            attempt_no: paymentAttempt.attempt_no || 1,
            gateway: activeProvider,
            payment_provider: activeProvider,
            payment_status: data.payment_status || "pending",
            payment_mode: data.payment_mode || paymentMode,
            total_amount: toNumber(data.total_amount || totalAmount),
            payable_now_amount: effectivePayableNowAmount,
            due_amount: toNumber(data.due_amount || dueAmount),
            settlement_status: data.settlement_status || settlementStatus,
            status_token: bookingStatusToken?.token || null,
            status_token_expires_at: bookingStatusToken?.expiresAt || null,
        }

        const sendBookingCreatedNotification = async (orderId: string) => {
            if (!notificationBooking || !notificationAttempt) return
            const bookingForNotification = {
                ...notificationBooking,
                payment_provider: activeProvider,
                payment_gateway_order_or_ref_id: orderId || notificationBooking.payment_gateway_order_or_ref_id,
                active_payment_attempt_id: notificationAttempt.id,
                payment_attempt_number: notificationAttempt.attempt_no || 1,
            }
            const status = await deliverInternalBookingNotification({
                supabase,
                eventType: "booking_created",
                eventKey: buildInternalNotificationEventKey({
                    eventType: "booking_created",
                    bookingId: String(bookingForNotification.id || ""),
                    attemptId: String(notificationAttempt.id || ""),
                }),
                booking: bookingForNotification as PaymentEmailBooking,
                attempt: notificationAttempt,
                eventName: "booking.created",
                eventId: notificationCheckoutRequestId,
                occurredAt: String(bookingForNotification.created_at || new Date().toISOString()),
            })
            if (status === "failed") {
                console.error("[create-booking] internal booking-created email failed", {
                    bookingId: bookingForNotification.id,
                    attemptId: notificationAttempt.id,
                })
            }
        }

        if (String(data.payment_status || "").trim().toLowerCase() === "paid") {
            await sendBookingCreatedNotification(
                firstNonEmpty(paymentAttempt.provider_order_id, data.payment_gateway_order_or_ref_id),
            )
            return new Response(JSON.stringify({ ...responsePayload, already_paid: true }), {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            })
        }

        if (activeProvider === "razorpay") {
            const credentials = razorpayCredentials()
            if (!credentials.keyId || !credentials.keySecret) {
                throw new Error("Razorpay payment configuration missing")
            }

            let orderId = firstNonEmpty(paymentAttempt.provider_order_id, data.payment_gateway_order_or_ref_id)
            let order: any = orderId ? { id: orderId, amount: Math.round(effectivePayableNowAmount * 100), currency } : null
            if (!orderId) {
                order = await createRazorpayOrder({
                    amount: effectivePayableNowAmount,
                    currency,
                    receipt: `twn_${String(paymentAttempt.id).replace(/-/g, "").slice(0, 32)}`,
                    notes: {
                        booking_id: String(data.id),
                        attempt_id: String(paymentAttempt.id),
                    },
                })
                orderId = String(order.id)
                const attemptUpdate = await supabase
                    .from("payment_attempts")
                    .update({
                        provider: "razorpay",
                        provider_order_id: orderId,
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", paymentAttempt.id)
                if (attemptUpdate.error) throw attemptUpdate.error
                paymentAttempt = { ...paymentAttempt, provider: "razorpay", provider_order_id: orderId }
            }

            const bookingUpdate = await supabase
                .from("bookings")
                .update({
                    payment_provider: "razorpay",
                    payment_gateway_order_or_ref_id: orderId,
                    active_payment_attempt_id: paymentAttempt.id,
                    payment_attempt_number: paymentAttempt.attempt_no || 1,
                })
                .eq("id", data.id)
            if (bookingUpdate.error && !isMissingColumnError(bookingUpdate.error, "payment_gateway_order_or_ref_id")) {
                throw bookingUpdate.error
            }

            responsePayload.razorpay = {
                key_id: credentials.keyId,
                order_id: orderId,
                amount: Math.max(1, Math.round(effectivePayableNowAmount * 100)),
                currency: String(currency || "INR").toUpperCase(),
                callback_url: paymentCallbackUrl({
                    bookingId: String(data.id),
                    statusToken: bookingStatusToken?.token,
                    supabaseUrl,
                }),
                notes: {
                    booking_id: String(data.id),
                    attempt_id: String(paymentAttempt.id),
                },
            }
        } else {
            return new Response(
                JSON.stringify({ error: `Unsupported payment provider: ${activeProvider}` }),
                { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            )
        }

        await sendBookingCreatedNotification(String(responsePayload.razorpay?.order_id || ""))

        return new Response(JSON.stringify(responsePayload), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
    } catch (err: any) {
        console.error("💥 create-booking error:", err)
        if (notificationBooking && notificationAttempt) {
            const setupStatus = await deliverInternalBookingNotification({
                supabase: notificationSupabase,
                eventType: "booking_setup_failed",
                eventKey: buildInternalNotificationEventKey({
                    eventType: "booking_setup_failed",
                    bookingId: String(notificationBooking.id || ""),
                    attemptId: String(notificationAttempt.id || ""),
                }),
                booking: notificationBooking,
                attempt: notificationAttempt,
                eventName: "booking.setup_failed",
                eventId: notificationCheckoutRequestId,
                errorMessage: String(err?.message || "Booking payment setup failed"),
                occurredAt: new Date().toISOString(),
            })
            if (setupStatus === "failed") {
                console.error("[create-booking] internal booking-setup-failed email failed", {
                    bookingId: notificationBooking.id,
                    attemptId: notificationAttempt.id,
                })
            }
        }
        const message = String(err?.message || "Internal server error")
        const status = /pricing|coupon|trip|traveller/i.test(message) ? 400 : 500
        return new Response(
            JSON.stringify({ error: message || "Internal server error" }),
            { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
    }
})
