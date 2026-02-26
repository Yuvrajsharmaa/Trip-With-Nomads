export const TAX_RATE = 0.05

export const SHARING_VALUES = ["Quad", "Triple", "Double"] as const
export type SharingValue = (typeof SHARING_VALUES)[number]

export type TravellerInput = {
    id?: number
    name?: string
    sharing?: string
    transport?: string
}

export type CouponValidationResult = {
    valid: boolean
    code: string | null
    message?: string
    discount_type?: "percent" | "fixed"
    discount_value?: number
    discount_amount?: number
    min_subtotal?: number
    couponSnapshot?: Record<string, unknown> | null
}

export type PricingLineItem = {
    traveller_id: number
    sharing: SharingValue
    transport: string
    unit_price: number
}

export type PricingQuote = {
    base_subtotal: number
    early_bird_discount_amount: number
    coupon_discount_amount: number
    applied_discount_source: "none" | "early_bird" | "coupon"
    applied_discount_code: string | null
    discount_amount_total: number
    taxable_amount: number
    tax_amount: number
    total_amount: number
    line_items: PricingLineItem[]
    coupon_wins: boolean
    final_applied_source: "none" | "early_bird" | "coupon"
}

function round2(value: number): number {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100
}

function toNumber(value: unknown): number {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
}

function toDateMs(value: unknown): number | null {
    if (!value) return null
    const ms = Date.parse(String(value))
    return Number.isFinite(ms) ? ms : null
}

function normalizeVehicle(value: unknown): string {
    return String(value || "").trim().replace(/\s+/g, " ")
}

export function normalizeSharing(value: unknown): SharingValue | "" {
    const clean = String(value || "").trim().replace(/\s+/g, " ")
    if (!clean) return ""

    const lowered = clean.toLowerCase()
    if (lowered.includes("quad")) return "Quad"
    if (lowered.includes("triple")) return "Triple"
    if (lowered.includes("double")) return "Double"

    return ""
}

export function normalizeCouponCode(raw: string): string {
    return String(raw || "").trim().toUpperCase()
}

export function getDateValue(row: any): string {
    return String(row?.start_date || row?.departure_date || "").trim()
}

export function getVariantValue(row: any): string {
    return normalizeSharing(row?.sharing)
}

export function getTransportValue(row: any): string {
    return normalizeVehicle(row?.vehicle || row?.transport)
}

function pickBestRow(rows: any[]): any | null {
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
    }, rows[0])
}

export function normalizeTravellers(input: any[]): TravellerInput[] {
    if (!Array.isArray(input)) return []

    return input.map((item, index) => {
        const normalizedSharing = normalizeSharing(item?.sharing)
        return {
            id: Number(item?.id) || index + 1,
            name: typeof item?.name === "string" ? item.name.trim() : "",
            sharing: normalizedSharing,
            transport: normalizeVehicle(item?.transport),
        }
    })
}

function computeEarlyBirdDiscountForRow(row: any, unitPrice: number, nowMs: number): number {
    const enabled = Boolean(row?.early_bird_enabled)
    if (!enabled || unitPrice <= 0) return 0

    const startsAt = toDateMs(row?.early_bird_starts_at)
    const endsAt = toDateMs(row?.early_bird_ends_at)
    if (startsAt != null && nowMs < startsAt) return 0
    if (endsAt != null && nowMs > endsAt) return 0

    const discountType = String(row?.early_bird_discount_type || "").toLowerCase()
    const discountValue = toNumber(row?.early_bird_discount_value)
    if (discountValue <= 0) return 0

    let discount = 0
    if (discountType === "percent") {
        discount = unitPrice * (discountValue / 100)
    } else {
        discount = discountValue
    }

    const maxDiscount =
        row?.early_bird_max_discount != null ? toNumber(row?.early_bird_max_discount) : null
    if (maxDiscount != null && maxDiscount > 0) {
        discount = Math.min(discount, maxDiscount)
    }

    return round2(Math.max(0, Math.min(discount, unitPrice)))
}

function requiresVehicleForDate(rowsByDate: any[]): boolean {
    return rowsByDate.some((row) => Boolean(getTransportValue(row)))
}

export function computeBasePricing(params: {
    pricingRows: any[]
    departureDate: string
    fallbackTransport: string
    travellers: TravellerInput[]
    nowMs?: number
}) {
    const { pricingRows, departureDate, fallbackTransport, travellers, nowMs = Date.now() } = params
    const rowsByDate = pricingRows.filter((row) => getDateValue(row) === departureDate)

    let subtotal = 0
    let earlyBirdDiscount = 0
    const missingSharings: string[] = []
    const lineItems: PricingLineItem[] = []
    const breakdownGroups: Record<string, { count: number; unit: number }> = {}
    const vehicleRequired = requiresVehicleForDate(rowsByDate)

    for (const traveller of travellers) {
        const travellerId = Number(traveller.id) || lineItems.length + 1
        const sharing = normalizeSharing(traveller.sharing)
        const requestedTransport = normalizeVehicle(traveller.transport || fallbackTransport)

        if (!sharing) {
            missingSharings.push("<blank>")
            continue
        }

        const bySharing = rowsByDate.filter((row) => getVariantValue(row) === sharing)
        if (bySharing.length === 0) {
            missingSharings.push(sharing)
            continue
        }

        let row: any | null = null
        if (vehicleRequired) {
            if (!requestedTransport) {
                missingSharings.push(`${sharing} (vehicle missing)`)
                continue
            }

            row = pickBestRow(
                bySharing.filter((candidate) => getTransportValue(candidate) === requestedTransport)
            )
            if (!row) {
                missingSharings.push(`${sharing} (${requestedTransport})`)
                continue
            }
        } else {
            row = pickBestRow(bySharing.filter((candidate) => !getTransportValue(candidate)))
            if (!row) row = pickBestRow(bySharing)
        }

        if (!row) {
            missingSharings.push(sharing)
            continue
        }

        const unitPrice = toNumber(row?.price)
        if (unitPrice <= 0) {
            missingSharings.push(sharing)
            continue
        }

        const resolvedTransport = getTransportValue(row)
        subtotal += unitPrice
        earlyBirdDiscount += computeEarlyBirdDiscountForRow(row, unitPrice, nowMs)

        lineItems.push({
            traveller_id: travellerId,
            sharing,
            transport: resolvedTransport,
            unit_price: round2(unitPrice),
        })

        const key = `${resolvedTransport}__${sharing}`
        if (!breakdownGroups[key]) {
            breakdownGroups[key] = { count: 0, unit: round2(unitPrice) }
        }
        breakdownGroups[key].count += 1
    }

    const paymentBreakdown = Object.entries(breakdownGroups).map(([key, data]) => {
        const [transport, sharing] = key.split("__")
        return {
            label: `${data.count}x Guest (${sharing}${transport ? ` · ${transport}` : ""})`,
            price: round2(data.unit * data.count),
            unit_price: data.unit,
            count: data.count,
            variant: sharing,
            transport: transport || "",
        }
    })

    const safeSubtotal = round2(Math.max(0, subtotal))
    const safeEarlyBird = round2(Math.max(0, Math.min(earlyBirdDiscount, safeSubtotal)))

    return {
        subtotal: safeSubtotal,
        earlyBirdDiscountAmount: safeEarlyBird,
        missingSharings,
        lineItems,
        paymentBreakdown,
        vehicleRequired,
    }
}

export async function validateCouponAgainstSubtotal(params: {
    supabase: any
    couponCode: string
    tripId: string
    subtotal: number
    email: string
}) {
    const { supabase, couponCode, tripId, subtotal, email } = params
    const normalizedCode = normalizeCouponCode(couponCode)

    if (!normalizedCode) {
        return {
            valid: true,
            code: null,
            discount_amount: 0,
            couponSnapshot: null,
        } satisfies CouponValidationResult
    }

    const { data: couponRows, error: couponError } = await supabase
        .from("coupons")
        .select("*")
        .ilike("code", normalizedCode)
        .limit(1)

    if (couponError) {
        throw new Error(`Coupon lookup failed: ${couponError.message}`)
    }

    const coupon = couponRows?.[0]
    if (!coupon) {
        return { valid: false, code: normalizedCode, message: "Invalid coupon code" } satisfies CouponValidationResult
    }
    if (!coupon.is_active) {
        return { valid: false, code: normalizedCode, message: "Coupon is inactive" } satisfies CouponValidationResult
    }

    const nowMs = Date.now()
    const startsAt = toDateMs(coupon.starts_at)
    const endsAt = toDateMs(coupon.ends_at)
    if (startsAt != null && nowMs < startsAt) {
        return {
            valid: false,
            code: normalizedCode,
            message: "Coupon is not active yet",
        } satisfies CouponValidationResult
    }
    if (endsAt != null && nowMs > endsAt) {
        return { valid: false, code: normalizedCode, message: "Coupon has expired" } satisfies CouponValidationResult
    }

    const scopedTrips = Array.isArray(coupon.applicable_trip_ids)
        ? coupon.applicable_trip_ids.map((v: any) => String(v))
        : []
    if (scopedTrips.length > 0 && !scopedTrips.includes(tripId)) {
        return {
            valid: false,
            code: normalizedCode,
            message: "Coupon is not applicable for this trip",
        } satisfies CouponValidationResult
    }

    const minSubtotal = toNumber(coupon.min_subtotal)
    if (subtotal < minSubtotal) {
        return {
            valid: false,
            code: normalizedCode,
            min_subtotal: minSubtotal,
            message: `Minimum subtotal ${minSubtotal.toLocaleString("en-IN")} required`,
        } satisfies CouponValidationResult
    }

    if (coupon.usage_limit_total) {
        const { count, error } = await supabase
            .from("bookings")
            .select("id", { count: "exact", head: true })
            .ilike("coupon_code", coupon.code)
            .neq("payment_status", "failed")
        if (error) throw new Error(`Coupon usage check failed: ${error.message}`)
        if ((count || 0) >= Number(coupon.usage_limit_total)) {
            return {
                valid: false,
                code: normalizedCode,
                message: "Coupon usage limit reached",
            } satisfies CouponValidationResult
        }
    }

    if (coupon.usage_limit_per_email && email) {
        const { count, error } = await supabase
            .from("bookings")
            .select("id", { count: "exact", head: true })
            .ilike("coupon_code", coupon.code)
            .eq("email", String(email).trim().toLowerCase())
            .neq("payment_status", "failed")
        if (error) throw new Error(`Coupon usage check failed: ${error.message}`)
        if ((count || 0) >= Number(coupon.usage_limit_per_email)) {
            return {
                valid: false,
                code: normalizedCode,
                message: "Coupon usage limit reached for this email",
            } satisfies CouponValidationResult
        }
    }

    const discountType = String(coupon.discount_type || "").toLowerCase() as "percent" | "fixed"
    const discountValue = toNumber(coupon.discount_value)
    let discountAmount = 0

    if (discountType === "percent") {
        discountAmount = subtotal * (discountValue / 100)
    } else {
        discountAmount = discountValue
    }

    const maxDiscount = coupon.max_discount != null ? toNumber(coupon.max_discount) : null
    if (maxDiscount != null && maxDiscount > 0) {
        discountAmount = Math.min(discountAmount, maxDiscount)
    }
    discountAmount = round2(Math.max(0, Math.min(discountAmount, subtotal)))

    const normalizedCouponCode = String(coupon.code || normalizedCode).toUpperCase()
    return {
        valid: true,
        code: normalizedCouponCode,
        discount_type: discountType,
        discount_value: discountValue,
        discount_amount: discountAmount,
        min_subtotal: minSubtotal,
        couponSnapshot: {
            id: coupon.id,
            code: normalizedCouponCode,
            discount_type: discountType,
            discount_value: discountValue,
            max_discount: maxDiscount,
            min_subtotal: minSubtotal,
            applicable_trip_ids: scopedTrips,
        },
    } satisfies CouponValidationResult
}

export function selectBestDiscount(params: {
    subtotal: number
    earlyBirdDiscountAmount: number
    couponResult: CouponValidationResult
}) {
    const { subtotal, earlyBirdDiscountAmount, couponResult } = params
    const safeSubtotal = round2(Math.max(0, subtotal))
    const early = round2(Math.max(0, Math.min(earlyBirdDiscountAmount || 0, safeSubtotal)))
    const coupon = round2(
        Math.max(0, Math.min(toNumber(couponResult?.discount_amount || 0), safeSubtotal))
    )

    const source: "none" | "early_bird" | "coupon" =
        coupon > 0 ? "coupon" : early > 0 ? "early_bird" : "none"
    const discount = round2(Math.max(0, Math.min(safeSubtotal, early + coupon)))
    const appliedCode = coupon > 0 ? couponResult?.code || null : null

    const taxable = round2(Math.max(0, safeSubtotal - discount))
    const tax = round2(taxable * TAX_RATE)
    const total = round2(taxable + tax)

    return {
        applied_discount_source: source,
        applied_discount_code: appliedCode,
        discount_amount_total: round2(discount),
        taxable_amount: taxable,
        tax_amount: tax,
        total_amount: total,
        coupon_wins: coupon > 0 && coupon >= early,
    }
}

export function buildPricingQuote(params: {
    baseSubtotal: number
    earlyBirdDiscountAmount: number
    couponResult: CouponValidationResult
    lineItems: PricingLineItem[]
}) {
    const { baseSubtotal, earlyBirdDiscountAmount, couponResult, lineItems } = params
    const selected = selectBestDiscount({
        subtotal: baseSubtotal,
        earlyBirdDiscountAmount,
        couponResult,
    })

    const couponDiscountAmount = round2(
        Math.max(0, Math.min(toNumber(couponResult?.discount_amount || 0), toNumber(baseSubtotal)))
    )

    const earlyBirdDiscountAmountApplied = round2(
        Math.max(0, Math.min(earlyBirdDiscountAmount, toNumber(baseSubtotal)))
    )

    return {
        base_subtotal: round2(Math.max(0, baseSubtotal)),
        early_bird_discount_amount: earlyBirdDiscountAmountApplied,
        coupon_discount_amount: couponDiscountAmount,
        applied_discount_source: selected.applied_discount_source,
        applied_discount_code: selected.applied_discount_code,
        discount_amount_total: selected.discount_amount_total,
        taxable_amount: selected.taxable_amount,
        tax_amount: selected.tax_amount,
        total_amount: selected.total_amount,
        line_items: lineItems,
        coupon_wins: selected.coupon_wins,
        final_applied_source: selected.applied_discount_source,
    } satisfies PricingQuote
}
