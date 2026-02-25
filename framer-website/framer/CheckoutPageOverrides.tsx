import React from "react"
import type { ComponentType } from "react"
import { createStore } from "https://framer.com/m/framer/store.js@^1.0.0"

const {
    createContext,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} = React

const SUPABASE_URL = "https://jxozzvwvprmnhvafmpsa.supabase.co"
const SUPABASE_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp4b3p6dnd2cHJtbmh2YWZtcHNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwNTg2NjIsImV4cCI6MjA4MzYzNDY2Mn0.KpVa9dWlJEguL1TA00Tf4QDpziJ1mgA2I0f4_l-vlOk"
const TAX_RATE = 0.02
const CHECKOUT_PAGE_URL = "https://twn2.framer.website/checkout"
const SHARING_VALUES = ["Quad", "Triple", "Double"] as const
type SharingValue = (typeof SHARING_VALUES)[number]

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_REGEX = /^\+?[\d\s\-()]{10,15}$/
const tripDisplayCache = new Map<string, { ts: number; data: any }>()

type Traveller = {
    id: number
    name: string
    transport: string
    sharing: SharingValue | ""
}

type CouponResult = {
    valid: boolean
    code?: string
    discount_type?: "percent" | "fixed"
    discount_value?: number
    discount_amount?: number
    min_subtotal?: number
    coupon_wins?: boolean
    final_applied_source?: "none" | "early_bird" | "coupon"
    base_subtotal?: number
    early_bird_discount_amount?: number
    coupon_discount_amount?: number
    applied_discount_source?: "none" | "early_bird" | "coupon"
    applied_discount_code?: string | null
    discount_amount_total?: number
    taxable_amount?: number
    tax_amount?: number
    total_amount?: number
    line_items?: Array<{
        traveller_id: number
        sharing: string
        transport: string
        unit_price: number
    }>
    message?: string
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

type TravellerContextValue = { id: number; index: number }
const TravellerContext = createContext<TravellerContextValue | null>(null)
type SummaryLineContextValue = { key: string; label: string; amount: number }
const SummaryLineContext = createContext<SummaryLineContextValue | null>(null)

const useStore = createStore({
    tripId: "",
    slug: "",
    tripName: "",
    pricingData: [] as any[],
    date: "",
    transport: "",
    travellers: [{ id: 1, name: "", transport: "", sharing: "" }] as Traveller[],
    inviteOnly: false,
    contactName: "",
    contactPhone: "",
    contactEmail: "",
    couponCode: "",
    appliedCoupon: null as CouponResult | null,
    pricingBreakdown: null as PricingBreakdown | null,
    couponMessage: "Enter a coupon code and tap Apply.",
    couponMessageType: "neutral" as "neutral" | "success" | "error",
    loading: false,
    submitting: false,
})

function toNumber(value: any): number {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
}

function pickFirstNumber(source: any, keys: string[], fallback = 0): number {
    if (!source || typeof source !== "object") return fallback
    for (const key of keys) {
        if (!(key in source)) continue
        const parsed = Number(source[key])
        if (Number.isFinite(parsed)) return parsed
    }
    return fallback
}

function round2(value: number): number {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100
}

function fmtINR(value: number): string {
    return "₹" + toNumber(value).toLocaleString("en-IN")
}

function buildPricingBreakdownFromQuote(source: any, fallbackStore: any): PricingBreakdown {
    const fallback = buildLocalPricingBreakdown(fallbackStore)
    const baseSubtotal = round2(
        pickFirstNumber(source, ["base_subtotal", "subtotal_amount", "subtotal"], fallback.base_subtotal)
    )
    const earlyBirdDiscountAmount = round2(
        pickFirstNumber(
            source,
            ["early_bird_discount_amount", "earlyBirdDiscountAmount"],
            fallback.early_bird_discount_amount
        )
    )
    const couponDiscountAmount = round2(
        pickFirstNumber(
            source,
            ["coupon_discount_amount", "couponDiscountAmount"],
            fallback.coupon_discount_amount
        )
    )
    const discountAmountTotal = round2(
        pickFirstNumber(
            source,
            ["discount_amount_total", "discount_amount", "discountAmount"],
            fallback.discount_amount_total
        )
    )

    const appliedDiscountSource = ((
        String(source?.applied_discount_source || source?.final_applied_source || "")
            .trim()
            .toLowerCase() || fallback.applied_discount_source
    ) as PricingBreakdown["applied_discount_source"]) || "none"

    const appliedDiscountCodeRaw = String(
        source?.applied_discount_code || source?.code || fallback.applied_discount_code || ""
    )
        .trim()
        .toUpperCase()

    const taxableAmount = round2(
        pickFirstNumber(
            source,
            ["taxable_amount", "taxableSubtotal"],
            Math.max(0, baseSubtotal - discountAmountTotal)
        )
    )
    const fallbackTax = round2(Math.max(0, taxableAmount) * TAX_RATE)
    const taxAmount = round2(pickFirstNumber(source, ["tax_amount", "taxAmount"], fallbackTax))
    const totalAmount = round2(
        pickFirstNumber(source, ["total_amount", "totalAmount"], Math.max(0, taxableAmount + taxAmount))
    )

    return {
        base_subtotal: baseSubtotal,
        early_bird_discount_amount: earlyBirdDiscountAmount,
        coupon_discount_amount: couponDiscountAmount,
        applied_discount_source: appliedDiscountSource,
        applied_discount_code: appliedDiscountCodeRaw || null,
        discount_amount_total: discountAmountTotal,
        taxable_amount: taxableAmount,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        line_items: Array.isArray(source?.line_items) ? source.line_items : fallback.line_items,
    }
}

function normalizeTravellerId(id: any, index: number): number {
    const parsed = Number(id)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
    return index + 1
}

function normalizeTravellers(input: any[]): Traveller[] {
    const base = Array.isArray(input) ? input : []
    const seen = new Set<number>()

    const out: Traveller[] = base.map((item, index) => {
        let id = normalizeTravellerId(item?.id, index)
        while (seen.has(id)) id += 1
        seen.add(id)
        return {
            id,
            name: typeof item?.name === "string" ? item.name : "",
            transport: typeof item?.transport === "string" ? item.transport : "",
            sharing: normalizeSharing(typeof item?.sharing === "string" ? item.sharing : ""),
        }
    })

    if (out.length === 0) {
        return [{ id: 1, name: "", transport: "", sharing: "" }]
    }

    return out
}

function getTravellerByContext(store: any, ctx: TravellerContextValue | null): Traveller | null {
    const travellers = normalizeTravellers(store?.travellers || [])
    if (!ctx) return null
    const byId = travellers.find((t) => toNumber(t.id) === toNumber(ctx.id))
    if (byId) return byId
    return travellers[ctx.index] || null
}

function updateTravellerById(store: any, id: number, patch: Partial<Traveller>): Traveller[] {
    const list = normalizeTravellers(store?.travellers || [])
    const idx = list.findIndex((t) => toNumber(t.id) === toNumber(id))
    if (idx >= 0) {
        list[idx] = { ...list[idx], ...patch }
    }
    return normalizeTravellers(list)
}

function removeTravellerById(store: any, id: number): Traveller[] {
    const list = normalizeTravellers(store?.travellers || [])
    const next = list.filter((t) => toNumber(t.id) !== toNumber(id))
    return normalizeTravellers(next)
}

function nextTravellerId(store: any): number {
    const travellers = normalizeTravellers(store?.travellers || [])
    return Math.max(0, ...travellers.map((t) => toNumber(t.id))) + 1
}

function getDateValue(row: any): string {
    return row?.start_date || row?.departure_date || ""
}

function normalizeSharing(value: string): SharingValue | "" {
    const clean = String(value || "").trim().replace(/\s+/g, " ")
    if (!clean) return ""
    const lower = clean.toLowerCase()
    if (lower.includes("quad")) return "Quad"
    if (lower.includes("triple")) return "Triple"
    if (lower.includes("double")) return "Double"
    return ""
}

function getVariantValue(row: any): string {
    return normalizeSharing(String(row?.sharing || ""))
}

function getTransportValue(row: any): string {
    const vehicle = String(row?.vehicle || "").trim()
    if (vehicle) return vehicle
    const transport = String(row?.transport || "").trim()
    if (transport) return transport
    return ""
}

function getDateOptions(pricing: any[]): string[] {
    return [...new Set((pricing || []).map((row: any) => getDateValue(row)).filter(Boolean))].sort()
}

function getTransportOptions(pricing: any[], date: string): string[] {
    const filtered = (pricing || []).filter((row: any) => !date || getDateValue(row) === date)
    const options = [...new Set(filtered.map((row: any) => getTransportValue(row)).filter(Boolean))].sort()
    return options
}

function hasVehicleOptions(pricing: any[], date: string): boolean {
    return getTransportOptions(pricing, date).length > 1
}

function getSharingOptions(pricing: any[], date: string, transport?: string): string[] {
    const filtered = (pricing || []).filter(
        (row: any) =>
            (!date || getDateValue(row) === date) &&
            (!transport || getTransportValue(row) === transport)
    )
    const valueSet = new Set(
        filtered
            .map((row: any) => getVariantValue(row))
            .filter((value) => SHARING_VALUES.includes(value as SharingValue))
    )
    return SHARING_VALUES.filter((value) => valueSet.has(value))
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

function resolvePriceForTraveller(pricing: any[], date: string, transport: string, sharing: string): number {
    if (!date || !sharing) return 0
    const row = (pricing || []).find(
        (item: any) =>
            getDateValue(item) === date &&
            (!transport || getTransportValue(item) === transport) &&
            getVariantValue(item) === sharing
    )
    return toNumber(row?.price)
}

function resolvePricingRowForTraveller(
    pricing: any[],
    date: string,
    transport: string,
    sharing: string
): any | null {
    if (!date || !sharing) return null
    const byTransportRows = (pricing || []).filter(
        (item: any) =>
            getDateValue(item) === date &&
            (!transport || getTransportValue(item) === transport) &&
            getVariantValue(item) === sharing
    )
    const byTransport = pickBestPricingRow(byTransportRows)
    if (byTransport) return byTransport
    const fallbackRows = (pricing || []).filter(
        (item: any) => getDateValue(item) === date && getVariantValue(item) === sharing
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
    const maxDiscount =
        row?.early_bird_max_discount != null ? toNumber(row.early_bird_max_discount) : null
    if (maxDiscount != null && maxDiscount > 0) discount = Math.min(discount, maxDiscount)
    return round2(Math.max(0, Math.min(discount, unitPrice)))
}

function buildLocalPricingBreakdown(store: any): PricingBreakdown {
    const pricingData = store?.pricingData || []
    const travellers = normalizeTravellers(store?.travellers || [])

    let subtotal = 0
    let earlyBirdDiscount = 0
    const lineItems: PricingBreakdown["line_items"] = []

    for (const traveller of travellers) {
        const transport = traveller.transport || ""
        const sharing = traveller.sharing
        if (!sharing) continue

        const row = resolvePricingRowForTraveller(pricingData, store.date, transport, sharing)
        const price = toNumber(row?.price)
        if (price <= 0) continue
        const resolvedTransport = getTransportValue(row)

        subtotal += price
        earlyBirdDiscount += computeEarlyBirdDiscountForRow(row, price)
        lineItems.push({
            traveller_id: toNumber(traveller.id),
            sharing,
            transport: resolvedTransport,
            unit_price: round2(price),
        })
    }

    const coupon = store?.appliedCoupon || null
    const couponType = String(coupon?.discount_type || "").toLowerCase()
    const couponValue = toNumber(coupon?.discount_value)
    const meetsCouponMinSubtotal =
        toNumber(coupon?.min_subtotal) <= 0 || subtotal >= toNumber(coupon?.min_subtotal)
    const couponRaw =
        couponType === "percent"
            ? round2((subtotal * couponValue) / 100)
            : couponType === "fixed"
              ? couponValue
              : toNumber(coupon?.discount_amount)
    const couponDiscount = meetsCouponMinSubtotal
        ? round2(Math.max(0, Math.min(couponRaw, subtotal)))
        : 0
    const earlyDiscount = round2(Math.max(0, Math.min(earlyBirdDiscount, subtotal)))

    const couponWins = couponDiscount > earlyDiscount

    const appliedSource: "none" | "early_bird" | "coupon" =
        couponWins && couponDiscount > 0
            ? "coupon"
            : earlyDiscount > 0
              ? "early_bird"
              : couponDiscount > 0
                ? "coupon"
                : "none"

    const discountTotal =
        appliedSource === "coupon"
            ? couponDiscount
            : appliedSource === "early_bird"
              ? earlyDiscount
              : 0
    const taxable = round2(Math.max(0, subtotal - discountTotal))
    const tax = round2(taxable * TAX_RATE)
    const total = round2(taxable + tax)

    return {
        base_subtotal: round2(subtotal),
        early_bird_discount_amount: appliedSource === "early_bird" ? discountTotal : earlyDiscount,
        coupon_discount_amount: appliedSource === "coupon" ? discountTotal : couponDiscount,
        applied_discount_source: appliedSource,
        applied_discount_code:
            appliedSource === "coupon" ? String(coupon?.code || "").trim().toUpperCase() || null : null,
        discount_amount_total: round2(discountTotal),
        taxable_amount: taxable,
        tax_amount: tax,
        total_amount: total,
        line_items: lineItems,
    }
}

function normalizeTravellerTransport(
    pricing: any[],
    date: string,
    value: string,
    fallback = ""
): string {
    const options = getTransportOptions(pricing, date)
    if (options.length === 0) return ""
    if (value && options.includes(value)) return value
    if (fallback && options.includes(fallback)) return fallback
    return options[0] || ""
}

function sanitizeTravellersForDate(
    pricing: any[],
    date: string,
    travellersInput: Traveller[],
    fallbackTransport = ""
): Traveller[] {
    const travellers = normalizeTravellers(travellersInput || [])
    return travellers.map((traveller) => {
        const transport = normalizeTravellerTransport(
            pricing,
            date,
            traveller.transport,
            fallbackTransport
        )
        const sharingOptions = getSharingOptions(pricing, date, transport)
        const sharing =
            traveller.sharing && sharingOptions.includes(traveller.sharing)
                ? traveller.sharing
                : ""

        return {
            ...traveller,
            transport,
            sharing,
        }
    })
}

function computeTotals(store: any) {
    const pricingBreakdown = store?.pricingBreakdown || buildLocalPricingBreakdown(store)
    const groups: Record<string, { count: number; unit: number }> = {}
    for (const line of pricingBreakdown.line_items || []) {
        const transport = String(line.transport || "")
        const sharing = String(line.sharing || "")
        const key = `${transport}__${sharing}`
        if (!groups[key]) groups[key] = { count: 0, unit: toNumber(line.unit_price) }
        groups[key].count += 1
    }

    const breakdown = Object.entries(groups).map(([key, data]) => {
        const [transport, variant] = key.split("__")
        return {
            label: `${data.count}x Guest (${variant}${transport ? ` · ${transport}` : ""})`,
            count: data.count,
            variant,
            transport,
            unit_price: round2(data.unit),
            price: round2(data.unit * data.count),
        }
    })

    const lineItemsSubtotal = round2(
        (pricingBreakdown.line_items || []).reduce(
            (sum: number, item: any) => sum + toNumber(item?.unit_price),
            0
        )
    )
    const subtotal = round2(
        pricingBreakdown.base_subtotal > 0 ? pricingBreakdown.base_subtotal : lineItemsSubtotal
    )
    const discount = round2(
        pricingBreakdown.discount_amount_total > 0
            ? pricingBreakdown.discount_amount_total
            : pricingBreakdown.applied_discount_source === "coupon"
              ? pricingBreakdown.coupon_discount_amount
              : pricingBreakdown.applied_discount_source === "early_bird"
                ? pricingBreakdown.early_bird_discount_amount
                : 0
    )
    const taxableSubtotal = round2(
        pricingBreakdown.taxable_amount > 0
            ? pricingBreakdown.taxable_amount
            : Math.max(0, subtotal - discount)
    )
    const computedTaxFromTaxable = round2(taxableSubtotal * TAX_RATE)
    const taxFromServerTotal = round2(
        Math.max(0, round2(pricingBreakdown.total_amount) - taxableSubtotal)
    )
    const tax =
        round2(pricingBreakdown.tax_amount) > 0
            ? round2(pricingBreakdown.tax_amount)
            : computedTaxFromTaxable > 0
              ? computedTaxFromTaxable
              : taxFromServerTotal
    const total =
        round2(pricingBreakdown.total_amount) > 0
            ? round2(pricingBreakdown.total_amount)
            : round2(taxableSubtotal + tax)

    return {
        subtotal,
        discount,
        taxableSubtotal,
        tax,
        total,
        earlyBirdDiscount: round2(pricingBreakdown.early_bird_discount_amount),
        couponDiscount: round2(pricingBreakdown.coupon_discount_amount),
        appliedDiscountSource: pricingBreakdown.applied_discount_source,
        appliedDiscountCode: pricingBreakdown.applied_discount_code,
        breakdown,
        lineItems: pricingBreakdown.line_items || [],
    }
}

function subtotalLineItemsText(store: any): string {
    const totals = computeTotals(store)
    if (!totals.breakdown?.length) return "Subtotal"

    const lines = totals.breakdown
        .map((item: any) => {
            const count = Math.max(1, toNumber(item?.count))
            const variant = String(item?.variant || "").trim() || "Sharing"
            return `${count} x ${variant}`
        })
        .filter(Boolean)

    return lines.length ? lines.join(" + ") : "Subtotal"
}

function getSummaryLineRows(store: any): Array<{ key: string; label: string; amount: number }> {
    const totals = computeTotals(store)
    if (!Array.isArray(totals.breakdown) || totals.breakdown.length === 0) return []
    return totals.breakdown.map((item: any, index: number) => ({
        key: `${item.variant || "variant"}-${item.transport || "transport"}-${index}`,
        label: `${Math.max(1, toNumber(item?.count))} × ${String(item?.variant || "Sharing")}`,
        amount: round2(toNumber(item?.price)),
    }))
}

function getValidationErrors(store: any): string[] {
    const errors: string[] = []

    if (!store?.tripId) errors.push("Trip ID missing")
    if (store?.inviteOnly) {
        errors.push("This trip is invite-only. Contact support to complete booking.")
        return errors
    }
    if (!store?.date) errors.push("Departure date is required")

    if (!store?.contactName?.trim()) errors.push("Contact name is required")
    if (!store?.contactPhone?.trim()) errors.push("Phone number is required")
    else if (!PHONE_REGEX.test(store.contactPhone.trim())) errors.push("Phone number is invalid")

    if (!store?.contactEmail?.trim()) errors.push("Email is required")
    else if (!EMAIL_REGEX.test(store.contactEmail.trim())) errors.push("Email is invalid")

    const travellers = normalizeTravellers(store?.travellers || [])
    const requireVehicle = hasVehicleOptions(store?.pricingData || [], store?.date || "")
    travellers.forEach((t, index) => {
        if (!t.name.trim()) errors.push(`Name required for Traveller ${index + 1}`)
        if (requireVehicle && !t.transport) errors.push(`Vehicle required for Traveller ${index + 1}`)
        if (!t.sharing) errors.push(`Sharing required for Traveller ${index + 1}`)
    })

    const totals = computeTotals(store)
    if (totals.total <= 0) errors.push("Total amount must be greater than zero")

    return errors
}

function showInlineError(errors: string | string[]) {
    const existing = document.getElementById("__checkout_error_toast")
    if (existing) existing.remove()

    const messages = Array.isArray(errors) ? errors : [errors]
    const toast = document.createElement("div")
    toast.id = "__checkout_error_toast"

    toast.innerHTML = `
        <div style="font-weight:700; margin-bottom:${messages.length > 1 ? "8px" : "0"};">⚠️ ${
        messages.length === 1 ? messages[0] : "Please complete:"
    }</div>
        ${
        messages.length > 1
            ? '<div style="opacity:.9;font-size:13px;line-height:1.5;">' +
              messages.map((m) => `• ${m}`).join("<br>") +
              "</div>"
            : ""
    }
    `

    Object.assign(toast.style, {
        position: "fixed",
        top: "20px",
        left: "50%",
        transform: "translateX(-50%)",
        background: "rgba(30,30,50,.95)",
        color: "#fff",
        padding: "14px 20px",
        borderRadius: "12px",
        fontSize: "14px",
        zIndex: "99999",
        boxShadow: "0 10px 28px rgba(0,0,0,.28)",
        maxWidth: "92vw",
    })

    document.body.appendChild(toast)
    setTimeout(() => {
        toast.style.opacity = "0"
        toast.style.transition = "opacity .25s ease"
        setTimeout(() => toast.remove(), 250)
    }, 3200)
}

function firstNonEmpty(...values: any[]): string {
    for (const value of values) {
        const next = String(value || "").trim()
        if (next) return next
    }
    return ""
}

function readInputValue(selectors: string[]): string {
    if (typeof document === "undefined") return ""
    for (const selector of selectors) {
        const el = document.querySelector(selector) as
            | HTMLInputElement
            | HTMLTextAreaElement
            | null
        const value = String(el?.value || "").trim()
        if (value) return value
    }
    return ""
}

function populateDropdown(select: HTMLSelectElement, options: string[]) {
    if (!select) return

    const firstOption = select.options[0]
    const placeholderText =
        firstOption && (firstOption.value === "" || /select/i.test(firstOption.text))
            ? firstOption.text
            : "Select option"

    select.innerHTML = ""
    const placeholder = document.createElement("option")
    placeholder.value = ""
    placeholder.text = placeholderText
    select.add(placeholder)

    options.forEach((value) => {
        const opt = document.createElement("option")
        opt.value = value
        opt.text = value
        select.add(opt)
    })
}

async function fetchTripIdBySlug(slug: string): Promise<string> {
    const cleanSlug = (slug || "").trim()
    if (!cleanSlug) return ""

    const res = await fetch(
        `${SUPABASE_URL}/rest/v1/trips?slug=eq.${encodeURIComponent(cleanSlug)}&select=id&limit=1`,
        {
            headers: {
                apikey: SUPABASE_KEY,
                Authorization: `Bearer ${SUPABASE_KEY}`,
            },
        }
    )

    if (!res.ok) return ""
    const rows = await res.json()
    return rows?.[0]?.id || ""
}

async function fetchTripContextById(tripId: string): Promise<{ id: string; slug: string; title: string } | null> {
    const cleanTripId = String(tripId || "").trim()
    if (!cleanTripId) return null

    const res = await fetch(
        `${SUPABASE_URL}/rest/v1/trips?id=eq.${encodeURIComponent(
            cleanTripId
        )}&select=id,slug,title&limit=1`,
        {
            headers: {
                apikey: SUPABASE_KEY,
                Authorization: `Bearer ${SUPABASE_KEY}`,
            },
        }
    )
    if (!res.ok) return null
    const rows = await res.json().catch(() => [])
    const row = Array.isArray(rows) ? rows[0] : null
    if (!row?.id) return null
    return {
        id: String(row.id || ""),
        slug: String(row.slug || ""),
        title: String(row.title || ""),
    }
}

function isInviteOnlyTrip(pricingRows: any[]): boolean {
    const rows = Array.isArray(pricingRows) ? pricingRows : []
    if (rows.length === 0) return false
    const hasSharingRows = rows.some((row) => Boolean(getVariantValue(row)))
    return !hasSharingRows
}

async function fetchTripPricing(tripId: string): Promise<any[]> {
    const cleanTripId = (tripId || "").trim()
    if (!cleanTripId) return []

    const res = await fetch(
        `${SUPABASE_URL}/rest/v1/trip_pricing?trip_id=eq.${encodeURIComponent(
            cleanTripId
        )}&select=*`,
        {
            headers: {
                apikey: SUPABASE_KEY,
                Authorization: `Bearer ${SUPABASE_KEY}`,
            },
        }
    )

    if (!res.ok) return []
    const rows = await res.json()
    return Array.isArray(rows) ? rows : []
}

async function fetchTripDisplayPrice(params: { slug?: string; tripId?: string }): Promise<any | null> {
    const slug = String(params.slug || "").trim()
    const tripId = String(params.tripId || "").trim()
    if (!slug && !tripId) return null

    const cacheKey = `${slug}::${tripId}`
    const now = Date.now()
    const cached = tripDisplayCache.get(cacheKey)
    if (cached && now - cached.ts < 120000) {
        return cached.data
    }

    const query = new URLSearchParams()
    if (slug) query.set("slug", slug)
    if (tripId) query.set("trip_id", tripId)
    query.set("v", "2")
    const res = await fetch(`${SUPABASE_URL}/functions/v1/get-trip-display-price?${query.toString()}`, {
        method: "GET",
        headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
        },
    })
    if (!res.ok) return null
    const data = await res.json().catch(() => null)
    if (data) tripDisplayCache.set(cacheKey, { ts: now, data })
    return data
}

function toTitleFromSlug(slug: string): string {
    const clean = String(slug || "").trim()
    if (!clean) return ""
    return clean
        .replace(/[-_]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
}

function readCheckoutRouteContext() {
    if (typeof window === "undefined") {
        return { tripId: "", slug: "", date: "", transport: "" }
    }
    const query = new URLSearchParams(window.location.search)
    return {
        tripId: String(query.get("tripId") || query.get("trip_id") || "").trim(),
        slug: String(query.get("slug") || "").trim(),
        date: String(query.get("date") || "").trim(),
        transport: String(query.get("vehicle") || query.get("transport") || "").trim(),
    }
}

function routeContextKey(ctx: {
    tripId: string
    slug: string
    date: string
    transport: string
}): string {
    return [ctx.tripId, ctx.slug, ctx.date, ctx.transport].join("|")
}

function withTextFromState(getText: (store: any) => string, fallback = "—") {
    return function (Component: ComponentType): ComponentType {
        return (props: any) => {
            const [store] = useStore()
            const text = getText(store) || fallback
            return <Component {...props} text={text} />
        }
    }
}

export function withCheckoutBootstrap(Component): ComponentType {
    return (props: any) => {
        const [store, setStore] = useStore()
        const bootKeyRef = useRef("")
        const [routeKey, setRouteKey] = useState(() =>
            routeContextKey(readCheckoutRouteContext())
        )

        useEffect(() => {
            const refreshRouteKey = () => {
                const key = routeContextKey(readCheckoutRouteContext())
                setRouteKey((prev) => (prev === key ? prev : key))
            }

            const interval = window.setInterval(refreshRouteKey, 500)
            window.addEventListener("popstate", refreshRouteKey)
            refreshRouteKey()

            return () => {
                window.clearInterval(interval)
                window.removeEventListener("popstate", refreshRouteKey)
            }
        }, [])

        useEffect(() => {
            let disposed = false

            const run = async () => {
                const ctx = readCheckoutRouteContext()
                if (!ctx.tripId && !ctx.slug) return

                if (bootKeyRef.current === routeKey) return
                bootKeyRef.current = routeKey

                setStore({ loading: true })
                let tripId = ctx.tripId
                let slug = ctx.slug

                if (!tripId && slug) {
                    tripId = await fetchTripIdBySlug(slug)
                }

                if (!tripId) {
                    if (!disposed) {
                        setStore({
                            loading: false,
                            couponMessageType: "error",
                            couponMessage: "Missing trip context. Open checkout from Book now button.",
                        })
                    }
                    return
                }

                const [pricing, tripContext] = await Promise.all([
                    fetchTripPricing(tripId),
                    fetchTripContextById(tripId),
                ])
                if (disposed) return

                slug = slug || String(tripContext?.slug || "").trim()
                const tripName = firstNonEmpty(
                    String(tripContext?.title || "").trim(),
                    toTitleFromSlug(slug),
                    tripId
                )

                const inviteOnly = isInviteOnlyTrip(pricing)
                const dates = getDateOptions(pricing)
                const date = dates.includes(ctx.date) ? ctx.date : dates[0] || ""
                const transports = getTransportOptions(pricing, date)
                const transport = transports.includes(ctx.transport)
                    ? ctx.transport
                    : transports[0] || ""
                const travellers = inviteOnly
                    ? normalizeTravellers(store.travellers || [])
                    : sanitizeTravellersForDate(
                          pricing,
                          date,
                          normalizeTravellers(store.travellers || []),
                          transport
                      )

                const nextState = {
                    ...store,
                    tripId,
                    slug,
                    tripName,
                    pricingData: pricing,
                    date,
                    transport,
                    travellers,
                    inviteOnly,
                    loading: false,
                }
                const pricingBreakdown = buildLocalPricingBreakdown(nextState)

                setStore({
                    tripId,
                    slug,
                    tripName,
                    pricingData: pricing,
                    date,
                    transport,
                    travellers,
                    inviteOnly,
                    pricingBreakdown,
                    loading: false,
                })

                console.log("[Checkout] Opened", {
                    tripId,
                    slug,
                    date,
                    defaultTransport: transport,
                    inviteOnly,
                })
            }

            run().catch((err) => {
                console.error("[Checkout] Bootstrap failed", err)
                if (!disposed) {
                    setStore({
                        loading: false,
                        couponMessageType: "error",
                        couponMessage: "Could not initialize checkout",
                    })
                }
            })

            return () => {
                disposed = true
            }
        }, [routeKey])

        useEffect(() => {
            if (!store?.tripId) return
            setStore({
                pricingBreakdown: buildLocalPricingBreakdown(store),
            })
        }, [store.tripId, store.pricingData, store.date, store.travellers, store.appliedCoupon])

        return <Component {...props} />
    }
}

export function withBookNowToCheckout(Component): ComponentType {
    return (props: any) => {
        const [store] = useStore()

        const handleClick = (e: any) => {
            e?.preventDefault?.()
            e?.stopPropagation?.()

            const current = window.location.pathname
            const slugFromPath = current.includes("/upcoming-trips/")
                ? current.split("/").pop() || ""
                : ""

            const tripId = props?.tripId || props?.["data-trip-id"] || store.tripId || ""
            const slug = props?.slug || props?.["data-trip-slug"] || slugFromPath || store.slug || ""

            const next = new URLSearchParams()
            if (tripId) next.set("tripId", tripId)
            if (slug) next.set("slug", slug)
            if (store.date) next.set("date", store.date)
            const travellers = normalizeTravellers(store.travellers || [])
            const firstTransport = travellers[0]?.transport || store.transport
            if (firstTransport) next.set("vehicle", firstTransport)

            const qs = next.toString()
            window.location.href = qs ? `${CHECKOUT_PAGE_URL}?${qs}` : CHECKOUT_PAGE_URL
        }

        return <Component {...props} onClick={handleClick} />
    }
}

export function withCheckoutTripId(Component): ComponentType {
    return withTextFromState((store) => store.tripId || "—")(Component)
}

export function withCheckoutSelectionText(Component): ComponentType {
    return withTextFromState((store) => {
        const tripName = store.tripName || store.slug || store.tripId || "trip name"
        return `Checkout for ${tripName}`
    })(Component)
}

export function withTravellerCount(Component): ComponentType {
    return withTextFromState((store) => {
        const count = normalizeTravellers(store?.travellers || []).length
        return `${count} Traveller${count === 1 ? "" : "s"}`
    })(Component)
}

export function withCheckoutBackButton(Component): ComponentType {
    return (props: any) => {
        const [store] = useStore()

        const handleClick = (e: any) => {
            e?.preventDefault?.()
            e?.stopPropagation?.()

            const slug = String(store?.slug || "").trim()
            if (slug) {
                window.location.href = `https://twn2.framer.website/upcoming-trips/${slug}`
                return
            }

            if (window.history.length > 1) {
                window.history.back()
                return
            }

            window.location.href = "https://twn2.framer.website/upcoming-trips"
        }

        return <Component {...props} onClick={handleClick} />
    }
}

export function withCheckoutDateSelect(Component): ComponentType {
    return (props: any) => {
        const [store, setStore] = useStore()
        const wrapperRef = useRef<HTMLDivElement>(null)
        const handleDateChange = (nextDate: string) => {
            const transports = getTransportOptions(store.pricingData || [], nextDate)
            const nextTransport = transports.includes(store.transport)
                ? store.transport
                : transports[0] || ""
            const travellers = sanitizeTravellersForDate(
                store.pricingData || [],
                nextDate,
                normalizeTravellers(store.travellers || []),
                nextTransport
            )
            setStore({
                date: nextDate,
                transport: nextTransport,
                travellers,
            })
        }

        useEffect(() => {
            if (!wrapperRef.current) return
            const select = wrapperRef.current.querySelector("select") as HTMLSelectElement | null
            if (!select) return

            const options = getDateOptions(store.pricingData || [])
            const signature = JSON.stringify(options)
            if (select.getAttribute("data-populated") !== signature) {
                populateDropdown(select, options)
                select.setAttribute("data-populated", signature)
            }

            if (store.date && select.value !== store.date) {
                select.value = store.date
            }
        }, [store.pricingData, store.date, store.transport, store.travellers])

        return (
            <div ref={wrapperRef} style={{ display: "contents" }}>
                <Component
                    {...props}
                    value={store.date || ""}
                    onValueChange={handleDateChange}
                    onChange={(e: any) => handleDateChange(e?.target?.value || "")}
                />
            </div>
        )
    }
}

export function withCheckoutVehicleSelect(Component): ComponentType {
    return (props: any) => {
        const [store] = useStore()
        const wrapperRef = useRef<HTMLDivElement>(null)

        useEffect(() => {
            if (!wrapperRef.current) return
            const select = wrapperRef.current.querySelector("select") as HTMLSelectElement | null
            if (!select) return

            const options = getTransportOptions(store.pricingData || [], store.date)
            const signature = JSON.stringify(options)
            if (select.getAttribute("data-populated") !== signature) {
                populateDropdown(select, options)
                select.setAttribute("data-populated", signature)
            }
            if (!select.value) select.value = ""
        }, [store.pricingData, store.date])

        return (
            <div ref={wrapperRef} style={{ display: "contents" }}>
                <Component
                    {...props}
                    style={{ ...(props.style || {}), display: "none", pointerEvents: "none" }}
                />
            </div>
        )
    }
}

export function withTravellerList(Component): ComponentType {
    return (props: any) => {
        const [store] = useStore()
        const travellers = normalizeTravellers(store.travellers || [])
        const childrenArray = React.Children.toArray(props.children)
        const template = childrenArray.find((child) => React.isValidElement(child)) as
            | React.ReactElement
            | undefined

        if (!template) {
            return <Component {...props} />
        }

        return (
            <Component
                {...props}
                style={{
                    ...(props.style || {}),
                    display: "flex",
                    flexDirection: "column",
                    gap: "16px",
                }}
            >
                {travellers.map((traveller, index) => {
                    const row = React.cloneElement(template, {
                        key: `traveller-${traveller.id}`,
                        style: {
                            ...((template.props as any)?.style || {}),
                            width: "100%",
                            position: "relative",
                        },
                    })

                    return (
                        <TravellerContext.Provider
                            key={`traveller-provider-${traveller.id}`}
                            value={{ id: traveller.id, index }}
                        >
                            {row}
                        </TravellerContext.Provider>
                    )
                })}
            </Component>
        )
    }
}

export function withTravellerLabel(Component): ComponentType {
    return (props: any) => {
        const ctx = useContext(TravellerContext)
        if (!ctx) return <Component {...props} />
        return <Component {...props} text={`TRAVELLER ${ctx.index + 1}`} />
    }
}

export function withTravellerName(Component): ComponentType {
    return (props: any) => {
        const [store, setStore] = useStore()
        const ctx = useContext(TravellerContext)
        if (!ctx) return <Component {...props} />

        const traveller = getTravellerByContext(store, ctx)
        const handleChange = (value: string) => {
            const next = updateTravellerById(store, ctx.id, { name: value })
            setStore({ travellers: next })
        }

        return (
            <Component
                {...props}
                value={traveller?.name || ""}
                onValueChange={handleChange}
                onChange={(e: any) => handleChange(e.target.value)}
                placeholder="Guest Name"
            />
        )
    }
}

export function withTravellerSharing(Component): ComponentType {
    return (props: any) => {
        const [store, setStore] = useStore()
        const ctx = useContext(TravellerContext)
        const wrapperRef = useRef<HTMLDivElement>(null)

        if (!ctx) return <Component {...props} />

        const traveller = getTravellerByContext(store, ctx)
        const travellerTransport = traveller?.transport || store.transport || ""
        const options = useMemo(
            () => getSharingOptions(store.pricingData || [], store.date, travellerTransport),
            [store.pricingData, store.date, travellerTransport]
        )

        const handleChange = (value: string) => {
            const normalized = normalizeSharing(value)
            const next = updateTravellerById(store, ctx.id, { sharing: normalized })
            setStore({ travellers: next })
        }

        useEffect(() => {
            if (!wrapperRef.current) return
            const select = wrapperRef.current.querySelector("select") as HTMLSelectElement | null
            if (!select) return

            const signature = JSON.stringify(options)
            if (select.getAttribute("data-populated") !== signature) {
                populateDropdown(select, options)
                select.setAttribute("data-populated", signature)
            }
        }, [options, ctx.id])

        return (
            <div ref={wrapperRef} style={{ display: "contents" }}>
                <Component
                    {...props}
                    value={traveller?.sharing || ""}
                    onValueChange={handleChange}
                    onChange={(e: any) => handleChange(e?.target?.value || "")}
                />
            </div>
        )
    }
}

export function withTravellerVehicleSelect(Component): ComponentType {
    return (props: any) => {
        const [store, setStore] = useStore()
        const ctx = useContext(TravellerContext)
        const wrapperRef = useRef<HTMLDivElement>(null)

        if (!ctx) return <Component {...props} />

        const traveller = getTravellerByContext(store, ctx)
        const options = useMemo(
            () => getTransportOptions(store.pricingData || [], store.date),
            [store.pricingData, store.date]
        )
        const hasMultipleVehicleOptions = options.length > 1
        const selectedTransport = normalizeTravellerTransport(
            store.pricingData || [],
            store.date,
            traveller?.transport || "",
            store.transport || ""
        )

        const handleChange = (value: string) => {
            const normalized = normalizeTravellerTransport(
                store.pricingData || [],
                store.date,
                value,
                store.transport || ""
            )
            const sharingOptions = getSharingOptions(store.pricingData || [], store.date, normalized)
            const nextSharing =
                traveller?.sharing && sharingOptions.includes(traveller.sharing)
                    ? traveller.sharing
                    : ""

            const next = updateTravellerById(store, ctx.id, {
                transport: normalized,
                sharing: nextSharing,
            })
            setStore({ travellers: next })
        }

        useEffect(() => {
            if (!wrapperRef.current) return
            const select = wrapperRef.current.querySelector("select") as HTMLSelectElement | null
            if (!select) return

            const signature = JSON.stringify(options)
            if (select.getAttribute("data-populated") !== signature) {
                populateDropdown(select, options)
                select.setAttribute("data-populated", signature)
            }
        }, [options, ctx.id])

        useEffect(() => {
            if (traveller && (!traveller.transport || traveller.transport !== selectedTransport)) {
                const next = updateTravellerById(store, ctx.id, { transport: selectedTransport })
                setStore({ travellers: next })
            }
        }, [ctx.id, traveller?.transport, selectedTransport])

        return (
            <div ref={wrapperRef} style={{ display: "contents" }}>
                <Component
                    {...props}
                    value={selectedTransport || ""}
                    onValueChange={handleChange}
                    onChange={(e: any) => handleChange(e?.target?.value || "")}
                    style={{
                        ...(props.style || {}),
                        ...(hasMultipleVehicleOptions
                            ? {}
                            : {
                                  display: "none",
                                  pointerEvents: "none",
                              }),
                    }}
                />
            </div>
        )
    }
}

export function withRemoveTraveller(Component): ComponentType {
    return (props: any) => {
        const [store, setStore] = useStore()
        const ctx = useContext(TravellerContext)
        if (!ctx) return <Component {...props} />

        if (ctx.index === 0) {
            return <Component {...props} style={{ ...(props.style || {}), display: "none" }} />
        }

        return (
            <Component
                {...props}
                onClick={(e: any) => {
                    e?.preventDefault?.()
                    e?.stopPropagation?.()
                    const list = removeTravellerById(store, ctx.id)
                    setStore({ travellers: list })
                }}
            />
        )
    }
}

export function withAddTraveller(Component): ComponentType {
    return (props: any) => {
        const [store, setStore] = useStore()

        return (
            <Component
                {...props}
                onClick={(e: any) => {
                    e?.preventDefault?.()
                    e?.stopPropagation?.()
                    const list = normalizeTravellers(store.travellers || [])
                    const fallbackTransport = normalizeTravellerTransport(
                        store.pricingData || [],
                        store.date,
                        store.transport || "",
                        ""
                    )
                    list.push({
                        id: nextTravellerId(store),
                        name: "",
                        transport: fallbackTransport,
                        sharing: "",
                    })
                    setStore({ travellers: normalizeTravellers(list) })
                }}
            />
        )
    }
}

export function withCheckoutContactName(Component): ComponentType {
    return (props: any) => {
        const [store, setStore] = useStore()
        const handleChange = (value: string) => setStore({ contactName: value })
        return (
            <Component
                {...props}
                value={store.contactName || ""}
                onValueChange={handleChange}
                onChange={(e: any) => handleChange(e.target.value)}
            />
        )
    }
}

export function withCheckoutContactPhone(Component): ComponentType {
    return (props: any) => {
        const [store, setStore] = useStore()
        const handleChange = (value: string) =>
            setStore({ contactPhone: String(value || "").replace(/[^\d\s\-+()]/g, "") })

        return (
            <Component
                {...props}
                value={store.contactPhone || ""}
                onValueChange={handleChange}
                onChange={(e: any) => handleChange(e.target.value)}
            />
        )
    }
}

export function withCheckoutContactEmail(Component): ComponentType {
    return (props: any) => {
        const [store, setStore] = useStore()
        const handleChange = (value: string) => setStore({ contactEmail: value })

        return (
            <Component
                {...props}
                value={store.contactEmail || ""}
                onValueChange={handleChange}
                onChange={(e: any) => handleChange(e.target.value)}
            />
        )
    }
}

export function withCouponCodeInput(Component): ComponentType {
    return (props: any) => {
        const [store, setStore] = useStore()

        const handleChange = (value: string) => {
            setStore({ couponCode: String(value || "").toUpperCase().trimStart() })
        }

        return (
            <Component
                {...props}
                value={store.couponCode || ""}
                onValueChange={handleChange}
                onChange={(e: any) => handleChange(e.target.value)}
                placeholder="Enter coupon code"
            />
        )
    }
}

export function withApplyCouponButton(Component): ComponentType {
    return (props: any) => {
        const [store, setStore] = useStore()
        const [busy, setBusy] = useState(false)

        const applyCoupon = async () => {
            if (store?.inviteOnly) {
                setStore({
                    couponMessageType: "error",
                    couponMessage: "Coupon is not applicable for invite-only trips.",
                    appliedCoupon: null,
                })
                return
            }

            const code = String(store.couponCode || "").trim().toUpperCase()
            if (!code) {
                setStore({
                    couponMessageType: "error",
                    couponMessage: "Enter a coupon code",
                    appliedCoupon: null,
                })
                return
            }

            if (!store.tripId || !store.date) {
                setStore({
                    couponMessageType: "error",
                    couponMessage: "Select trip date before applying coupon",
                    appliedCoupon: null,
                })
                return
            }

            setBusy(true)
            try {
                const payload = {
                    trip_id: store.tripId,
                    departure_date: store.date,
                    transport: store.transport || null,
                    travellers: normalizeTravellers(store.travellers || []).map((t) => ({
                        id: t.id,
                        name: t.name,
                        sharing: t.sharing,
                        transport: t.transport || "",
                    })),
                    coupon_code: code,
                    email: store.contactEmail || "",
                }

                const res = await fetch(`${SUPABASE_URL}/functions/v1/validate-coupon`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        apikey: SUPABASE_KEY,
                        Authorization: `Bearer ${SUPABASE_KEY}`,
                    },
                    body: JSON.stringify(payload),
                })

                const data = await res.json().catch(() => ({}))

                if (!res.ok || !data?.valid) {
                    setStore({
                        appliedCoupon: null,
                        pricingBreakdown: buildLocalPricingBreakdown({
                            ...store,
                            appliedCoupon: null,
                        }),
                        couponMessageType: "error",
                        couponMessage:
                            data?.message || data?.error || `Coupon failed (HTTP ${res.status})`,
                    })
                    console.log("[Checkout] Coupon apply failed", data)
                    return
                }

                const nextBreakdown = buildPricingBreakdownFromQuote(data, store)
                const appliedCode = String(
                    data.applied_discount_code || data.code || code || ""
                )
                    .trim()
                    .toUpperCase()

                setStore({
                    appliedCoupon: {
                        valid: true,
                        code: data.code || code,
                        discount_type: data.discount_type,
                        discount_value: toNumber(data.discount_value),
                        discount_amount: toNumber(data.discount_amount),
                        min_subtotal: toNumber(data.min_subtotal),
                        coupon_wins: Boolean(data.coupon_wins),
                        final_applied_source:
                            data.final_applied_source || data.applied_discount_source || "none",
                        base_subtotal: nextBreakdown.base_subtotal,
                        early_bird_discount_amount: nextBreakdown.early_bird_discount_amount,
                        coupon_discount_amount: nextBreakdown.coupon_discount_amount,
                        applied_discount_source: nextBreakdown.applied_discount_source,
                        applied_discount_code: nextBreakdown.applied_discount_code,
                        discount_amount_total: nextBreakdown.discount_amount_total,
                        taxable_amount: nextBreakdown.taxable_amount,
                        tax_amount: nextBreakdown.tax_amount,
                        total_amount: nextBreakdown.total_amount,
                        line_items: nextBreakdown.line_items,
                        message: data.message,
                    },
                    couponCode: data.code || code,
                    pricingBreakdown: nextBreakdown,
                    couponMessageType: "success",
                    couponMessage:
                        data.message ||
                        (data.final_applied_source === "coupon"
                            ? `Coupon ${appliedCode || data.code || code} applied`
                            : "Early-bird discount gives the best price"),
                })

                console.log("[Checkout] Coupon apply success", data)
            } catch (err: any) {
                setStore({
                    appliedCoupon: null,
                    pricingBreakdown: buildLocalPricingBreakdown({
                        ...store,
                        appliedCoupon: null,
                    }),
                    couponMessageType: "error",
                    couponMessage: "Could not validate coupon",
                })
                console.error("[Checkout] Coupon call error", err)
            } finally {
                setBusy(false)
            }
        }

        return (
            <Component
                {...props}
                text={busy ? "Applying..." : props.text || "Apply"}
                onClick={(e: any) => {
                    e?.preventDefault?.()
                    e?.stopPropagation?.()
                    if (!busy) applyCoupon()
                }}
                style={{
                    ...(props.style || {}),
                    opacity: busy ? 0.7 : 1,
                    cursor: busy ? "wait" : "pointer",
                }}
            />
        )
    }
}

export function withRemoveCouponButton(Component): ComponentType {
    return (props: any) => {
        const [store, setStore] = useStore()
        const visible = Boolean(store.appliedCoupon?.valid)

        if (!visible) {
            return <Component {...props} style={{ ...(props.style || {}), display: "none" }} />
        }

        return (
            <Component
                {...props}
                onClick={(e: any) => {
                    e?.preventDefault?.()
                    e?.stopPropagation?.()
                    setStore({
                        appliedCoupon: null,
                        pricingBreakdown: buildLocalPricingBreakdown({
                            ...store,
                            appliedCoupon: null,
                        }),
                        couponMessageType: "neutral",
                        couponMessage: "Coupon removed",
                    })
                }}
            />
        )
    }
}

export function withCouponMessage(Component): ComponentType {
    return (props: any) => {
        const [store] = useStore()
        const totals = computeTotals(store)
        let text = store.couponMessage || "Enter a coupon code and tap Apply."
        if (store.appliedCoupon?.code) {
            if (totals.appliedDiscountSource === "early_bird") {
                text = "Early-bird discount gives the best price for current selection."
            } else if (totals.appliedDiscountSource === "coupon") {
                text = `Coupon ${store.appliedCoupon.code} applied`
            }
        }

        const color =
            store.couponMessageType === "success"
                ? "#15803d"
                : store.couponMessageType === "error"
                  ? "#dc2626"
                  : "#6b7280"

        return (
            <Component
                {...props}
                text={text}
                style={{ ...(props.style || {}), color }}
            />
        )
    }
}

export function withCheckoutSummaryLineItems(Component): ComponentType {
    return (props: any) => {
        const [store] = useStore()
        const rows = getSummaryLineRows(store)
        const childrenArray = React.Children.toArray(props.children)
        const template = childrenArray.find((child) => React.isValidElement(child)) as
            | React.ReactElement
            | undefined

        if (!template) return <Component {...props} />
        if (rows.length === 0) {
            return <Component {...props} style={{ ...(props.style || {}), display: "none" }} />
        }

        return (
            <Component
                {...props}
                style={{ ...(props.style || {}), display: "flex", flexDirection: "column", gap: "8px" }}
            >
                {rows.map((row) => (
                    <SummaryLineContext.Provider key={row.key} value={row}>
                        {React.cloneElement(template, { key: row.key })}
                    </SummaryLineContext.Provider>
                ))}
            </Component>
        )
    }
}

export function withCheckoutSummaryLineLabel(Component): ComponentType {
    return (props: any) => {
        const row = useContext(SummaryLineContext)
        return <Component {...props} text={row?.label || props.text || ""} />
    }
}

export function withCheckoutSummaryLineAmount(Component): ComponentType {
    return (props: any) => {
        const row = useContext(SummaryLineContext)
        return <Component {...props} text={fmtINR(toNumber(row?.amount || 0))} />
    }
}

export function withCheckoutSubtotal(Component): ComponentType {
    return withTextFromState((store) => fmtINR(computeTotals(store).subtotal))(Component)
}

export function withCheckoutSubtotalLabel(Component): ComponentType {
    return withTextFromState((store) => subtotalLineItemsText(store), "Subtotal")(Component)
}

export function withCheckoutDiscount(Component): ComponentType {
    return withTextFromState((store) => `- ${fmtINR(computeTotals(store).discount)}`)(Component)
}

export function withCheckoutDiscountLabel(Component): ComponentType {
    return withTextFromState((store) => {
        const totals = computeTotals(store)
        if (totals.appliedDiscountSource === "coupon" && totals.appliedDiscountCode) {
            return `Coupon (${totals.appliedDiscountCode})`
        }
        if (totals.appliedDiscountSource === "early_bird") return "Early Bird"
        return "Discount"
    })(Component)
}

export function withCheckoutCouponCode(Component): ComponentType {
    return withTextFromState((store) => {
        const totals = computeTotals(store)
        if (totals.appliedDiscountSource === "coupon" && totals.appliedDiscountCode) {
            return totals.appliedDiscountCode
        }
        return "No coupon"
    })(Component)
}

export function withCheckoutTax(Component): ComponentType {
    return withTextFromState((store) => fmtINR(computeTotals(store).tax))(Component)
}

export function withCheckoutTaxLabel(Component): ComponentType {
    return withTextFromState(() => "Tax (2%)")(Component)
}

export function withCheckoutTaxValue(Component): ComponentType {
    return withTextFromState((store) => fmtINR(computeTotals(store).tax))(Component)
}

export function withCheckoutTotal(Component): ComponentType {
    return withTextFromState((store) => fmtINR(computeTotals(store).total))(Component)
}

export function withCheckoutValidationHint(Component): ComponentType {
    return withTextFromState((store) => {
        if (store?.inviteOnly) {
            return "This trip is invite-only. Contact support to book."
        }
        if (!store?.date) return "Select departure date."

        const travellers = normalizeTravellers(store?.travellers || [])
        const requireVehicle = hasVehicleOptions(store?.pricingData || [], store?.date || "")
        const travellerMissing = travellers.some(
            (t) => !t.name?.trim() || !t.sharing || (requireVehicle && !t.transport)
        )
        if (travellerMissing) {
            return requireVehicle
                ? "Complete traveller details (name, sharing, vehicle)."
                : "Complete traveller details (name, sharing)."
        }

        if (!store?.contactName?.trim() || !store?.contactPhone?.trim() || !store?.contactEmail?.trim()) {
            return "Enter contact name, phone and email."
        }

        const totals = computeTotals(store)
        if (totals.total <= 0) return "Select valid sharing options to calculate total."

        return "Ready to pay"
    })(Component)
}

// Hide coupon-specific rows/labels if no coupon is currently applied.
export function withCheckoutHideWhenNoCoupon(Component): ComponentType {
    return (props: any) => {
        const [store] = useStore()
        const totals = computeTotals(store)
        const hasCoupon =
            totals.appliedDiscountSource === "coupon" &&
            Boolean(String(totals.appliedDiscountCode || "").trim())

        if (!hasCoupon) {
            return <Component {...props} style={{ ...(props.style || {}), display: "none" }} />
        }
        return <Component {...props} />
    }
}

// Hide discount rows when discount is zero (or no coupon effect).
export function withCheckoutHideWhenNoDiscount(Component): ComponentType {
    return (props: any) => {
        const [store] = useStore()
        const hasDiscount = computeTotals(store).discount > 0

        if (!hasDiscount) {
            return <Component {...props} style={{ ...(props.style || {}), display: "none" }} />
        }
        return <Component {...props} />
    }
}

export function withCheckoutPayButton(Component): ComponentType {
    return (props: any) => {
        const [store, setStore] = useStore()
        const totals = computeTotals(store)
        const errors = getValidationErrors(store)
        const isValid = errors.length === 0

        const submit = async () => {
            if (!isValid || store.submitting) return

            if (store?.inviteOnly) {
                showInlineError("This trip is invite-only. Please contact support to book.")
                return
            }

            setStore({ submitting: true })
            console.log("[Checkout] Pay initiated", {
                tripId: store.tripId,
                date: store.date,
                transport: store.transport,
                coupon: store.appliedCoupon?.code || null,
                total: totals.total,
            })

            const fallbackName = readInputValue([
                'input[name="contact_name"]',
                'input[name="name"]',
                'input[placeholder*="name" i]',
            ])
            const fallbackPhone = readInputValue([
                'input[name="contact_phone"]',
                'input[name="phone"]',
                'input[type="tel"]',
                'input[placeholder*="phone" i]',
                'input[placeholder*="number" i]',
            ])
            const fallbackEmail = readInputValue([
                'input[name="contact_email"]',
                'input[name="email"]',
                'input[type="email"]',
                'input[placeholder*="email" i]',
            ])

            const contactName = firstNonEmpty(store.contactName, fallbackName)
            const contactPhone = firstNonEmpty(store.contactPhone, fallbackPhone)
            const contactEmail = firstNonEmpty(store.contactEmail, fallbackEmail)
            const normalizedTravellers = normalizeTravellers(store.travellers || []).map((t) => ({
                id: t.id,
                name: String(t.name || "").trim(),
                sharing: String(t.sharing || "").trim(),
                transport: String(t.transport || "").trim(),
            }))

            const payload = {
                trip_id: store.tripId,
                date: store.date,
                departure_date: store.date,
                transport: store.transport || null,
                travellers: normalizedTravellers,
                traveller_details: normalizedTravellers,
                travellers_count: normalizedTravellers.length,
                name: contactName,
                email: contactEmail,
                phone: contactPhone,
                amount: totals.total,
                total_amount: totals.total,
                tax_amount: totals.tax,
                payment_breakdown: totals.breakdown,
                currency: "INR",
                created_at: new Date().toISOString(),
                coupon_code: store.appliedCoupon?.code || null,
                pricing_snapshot: {
                    subtotal_amount: totals.subtotal,
                    discount_amount: totals.discount,
                    applied_discount_source: totals.appliedDiscountSource,
                    applied_discount_code: totals.appliedDiscountCode,
                    tax_amount: totals.tax,
                    total_amount: totals.total,
                },
            }

            try {
                const headers = {
                    "Content-Type": "application/json",
                    apikey: SUPABASE_KEY,
                    Authorization: `Bearer ${SUPABASE_KEY}`,
                }

                let res = await fetch(`${SUPABASE_URL}/functions/v1/create-booking`, {
                    method: "POST",
                    headers,
                    body: JSON.stringify(payload),
                })

                let data = await res.json().catch(() => ({}))
                const legacyMissingFieldsError =
                    typeof data?.error === "string" &&
                    data.error.includes("Missing required fields (trip_id, date, travellers, amount, email, name)")

                if (!res.ok && legacyMissingFieldsError) {
                    const form = new URLSearchParams()
                    form.set("trip_id", String(payload.trip_id || ""))
                    form.set("date", String(payload.date || ""))
                    form.set("amount", String(payload.amount || ""))
                    form.set("email", String(payload.email || ""))
                    form.set("name", String(payload.name || ""))
                    form.set("phone", String(payload.phone || ""))
                    form.set("transport", String(payload.transport || ""))
                    form.set("travellers", JSON.stringify(payload.travellers || []))
                    form.set("coupon_code", String(payload.coupon_code || ""))
                    form.set("pricing_snapshot", JSON.stringify(payload.pricing_snapshot || {}))

                    res = await fetch(`${SUPABASE_URL}/functions/v1/create-booking`, {
                        method: "POST",
                        headers: {
                            apikey: SUPABASE_KEY,
                            Authorization: `Bearer ${SUPABASE_KEY}`,
                            "Content-Type": "application/x-www-form-urlencoded",
                        },
                        body: form.toString(),
                    })
                    data = await res.json().catch(() => ({}))
                }

                if (!res.ok) {
                    console.error("[Checkout] create-booking failed", {
                        status: res.status,
                        payload,
                        response: data,
                    })
                    showInlineError(data?.error || `Payment setup failed (HTTP ${res.status})`)
                    setStore({ submitting: false })
                    return
                }

                const payu = data?.payu
                if (!payu?.action) {
                    showInlineError("Payment gateway payload missing")
                    setStore({ submitting: false })
                    return
                }

                const form = document.createElement("form")
                form.method = "POST"
                form.action = payu.action

                Object.entries(payu).forEach(([key, value]) => {
                    if (key === "action") return
                    const input = document.createElement("input")
                    input.type = "hidden"
                    input.name = key
                    input.value = String(value)
                    form.appendChild(input)
                })

                document.body.appendChild(form)
                form.submit()
            } catch (err) {
                console.error("[Checkout] pay error", err)
                showInlineError("Could not start payment")
                setStore({ submitting: false })
            }
        }

        return (
            <div style={{ position: "relative", width: "100%" }}>
                <Component
                    {...props}
                    onClick={submit}
                    style={{
                        ...(props.style || {}),
                        width: "100%",
                        opacity: isValid ? 1 : 0.6,
                        cursor: isValid ? "pointer" : "not-allowed",
                    }}
                />
                {!isValid && (
                    <div
                        onClick={(e: any) => {
                            e?.preventDefault?.()
                            e?.stopPropagation?.()
                            showInlineError(errors)
                        }}
                        style={{
                            position: "absolute",
                            inset: 0,
                            zIndex: 10,
                            cursor: "not-allowed",
                        }}
                    />
                )}
            </div>
        )
    }
}

function getTripSlugFromPathname(pathname: string): string {
    const clean = String(pathname || "")
    const match = clean.match(/\/upcoming-trips\/([^/?#]+)/i)
    return match?.[1] ? decodeURIComponent(match[1]) : ""
}

function useTripDisplaySummary() {
    const [summary, setSummary] = useState<any>(null)

    useEffect(() => {
        let disposed = false
        const query = new URLSearchParams(window.location.search)
        const slug = query.get("slug") || getTripSlugFromPathname(window.location.pathname)
        const tripId = query.get("tripId") || query.get("trip_id") || ""

        fetchTripDisplayPrice({ slug, tripId })
            .then((data) => {
                if (disposed) return
                setSummary(data?.display_summary || null)
            })
            .catch(() => {
                if (disposed) return
                setSummary(null)
            })

        return () => {
            disposed = true
        }
    }, [])

    return summary
}

export function withTripPrimaryPrice(Component): ComponentType {
    return (props: any) => {
        const summary = useTripDisplaySummary()
        const value = toNumber(summary?.payable_price)
        const text = value > 0 ? fmtINR(value) : "₹0"
        return <Component {...props} text={text} children={text} />
    }
}

export function withTripStrikePrice(Component): ComponentType {
    return (props: any) => {
        const summary = useTripDisplaySummary()
        const base = toNumber(summary?.base_price)
        const payable = toNumber(summary?.payable_price)
        const hasDiscount = Boolean(summary?.has_discount) && base > payable && payable > 0
        if (!hasDiscount) {
            return <Component {...props} text="" style={{ ...(props.style || {}), display: "none" }} />
        }
        const text = fmtINR(base)
        return (
            <Component
                {...props}
                text={text}
                children={text}
                style={{
                    ...(props.style || {}),
                    display: "inline",
                    opacity: 0.65,
                    textDecoration: "line-through",
                    textDecorationLine: "line-through",
                    textDecorationThickness: "1px",
                }}
            />
        )
    }
}

export function withTripSaveBadge(Component): ComponentType {
    return (props: any) => {
        const summary = useTripDisplaySummary()
        const save = toNumber(summary?.save_amount)
        const hasDiscount = Boolean(summary?.has_discount) && save > 0
        if (!hasDiscount) {
            return <Component {...props} style={{ ...(props.style || {}), display: "none" }} />
        }
        const text = `Save ${fmtINR(save)}`
        return <Component {...props} text={text} children={text} />
    }
}

export function withTripHideWhenNoDiscount(Component): ComponentType {
    return (props: any) => {
        const summary = useTripDisplaySummary()
        const hasDiscount = Boolean(summary?.has_discount) && toNumber(summary?.save_amount) > 0
        if (!hasDiscount) {
            return <Component {...props} style={{ ...(props.style || {}), display: "none" }} />
        }
        return <Component {...props} />
    }
}

export function withTripStartsFromText(Component): ComponentType {
    return (props: any) => {
        const text = "Starts from"
        return <Component {...props} text={text} children={text} />
    }
}
