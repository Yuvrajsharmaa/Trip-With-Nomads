import type { ComponentType } from "react"
import React from "react"

const { useEffect, useRef, useState } = React

// ─────────────────────────────────────────────────────────────
// Booking Status Override — UNIFIED SUCCESS / FAILURE PAGE
//
// HOW IT WORKS:
//   1. handle-payment Edge Function redirects to the neutral status UI.
//      The webhook and signed status response decide whether payment passed.
//   2. withBookingStatus reads `booking_id` from URL.
//   3. Fetches the full booking row from Supabase.
//   4. Payment status and settlement status remain separate throughout.
//
// FRAMER SETUP:
//   1. Apply withBookingStatus  → outermost page frame
//   2. Apply withStatusIcon     → the ✓ icon element
//   3. Apply withHeadingText    → "Booking Confirmed!" heading
//   4. Apply withSubheadingText → subtitle text layer
//
//   ┌─────────────────────────────────────────────────┐
//   │ BOOKING DETAILS CARD                            │
//   │   "Booking id"  → value text: withBookingId     │
//   │   "Trip Name"   → value text: withTripName      │
//   │   "Departure"   → value text: withDepartureDate │
//   │   "✓ Confirmed" → badge:      withStatusBadge   │
//   ├─────────────────────────────────────────────────┤
//   │ TRAVELLERS CARD                                 │
//   │   "2 Travellers" → badge: withTravellerCount    │
//   │   Container      → list:  withTravellerList     │
//   ├─────────────────────────────────────────────────┤
//   │ PAYMENT SUMMARY CARD  (withHideOnFailure)       │
//   │   "Paid"     → badge: withPaymentBadge          │
//   │   Base Price → value: withBasePrice              │
//   │   Subtotal   → value: withSubtotal              │
//   │   GST        → value: withTaxAmount             │
//   │   Total Paid → value: withTotalPaid             │
//   ├─────────────────────────────────────────────────┤
//   │ RETRY BUTTON (withRetryButton)                  │
//   │   Hidden on success, visible on failure         │
//   └─────────────────────────────────────────────────┘
//
// ─────────────────────────────────────────────────────────────

type RuntimeEnv = "production" | "development"
type RuntimeConfig = {
    siteBaseUrl: string
    supabaseUrl: string
    supabaseAnonKey: string
    apiBaseUrl: string
}

const RUNTIME_CONFIG: Record<RuntimeEnv, RuntimeConfig> = {
    production: {
        siteBaseUrl: "https://tripwithnomads.com",
        supabaseUrl: "https://jxozzvwvprmnhvafmpsa.supabase.co",
        supabaseAnonKey:
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp4b3p6dnd2cHJtbmh2YWZtcHNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwNTg2NjIsImV4cCI6MjA4MzYzNDY2Mn0.KpVa9dWlJEguL1TA00Tf4QDpziJ1mgA2I0f4_l-vlOk",
        // Production must not call the staging worker by default.
        apiBaseUrl: "",
    },
    development: {
        siteBaseUrl: "https://maroon-aside-814100.framer.app",
        supabaseUrl: "https://ieuwiinbvbdvjrdqqzlb.supabase.co",
        supabaseAnonKey:
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlldXdpaW5idmJkdmpyZHFxemxiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwNDYwMTksImV4cCI6MjA4NzYyMjAxOX0.UlTMeyvArixD7byDCrGwEDXsbc4LQfx6QXDL6Je3blE",
        apiBaseUrl: "https://twn-checkout-gateway-staging.tripwithnomads-crm.workers.dev",
    },
}

function normalizeBaseUrl(value: string): string {
    return String(value || "").trim().replace(/\/+$/, "")
}

function normalizeBookingId(value: string): string {
    const clean = String(value || "").trim()
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clean)) {
        return ""
    }
    return clean
}

function resolveRuntimeEnv(): RuntimeEnv {
    if (typeof window === "undefined") return "production"
    const host = String(window.location.hostname || "").trim().toLowerCase()
    if (host === "tripwithnomads.com" || host === "www.tripwithnomads.com") return "production"
    if (
        host === "maroon-aside-814100.framer.app" ||
        host.endsWith(".framer.app") ||
        host.endsWith(".framer.website") ||
        host === "localhost" ||
        host === "127.0.0.1"
    ) {
        return "development"
    }
    return "production"
}

function resolveRuntimeConfig(): RuntimeConfig {
    const env = resolveRuntimeEnv()
    const selected = RUNTIME_CONFIG[env]
    const runtimeOverride =
        typeof window !== "undefined" ? (window as any).__TWN_RUNTIME_CONFIG__ || {} : {}
    return {
        siteBaseUrl: normalizeBaseUrl(runtimeOverride.siteBaseUrl || selected.siteBaseUrl),
        supabaseUrl: String(runtimeOverride.supabaseUrl || selected.supabaseUrl || "").trim(),
        supabaseAnonKey: String(
            runtimeOverride.supabaseAnonKey || selected.supabaseAnonKey || ""
        ).trim(),
        apiBaseUrl: normalizeBaseUrl(runtimeOverride.apiBaseUrl || selected.apiBaseUrl),
    }
}

function createUuid(): string {
    const randomUuid = (globalThis as any)?.crypto?.randomUUID
    if (typeof randomUuid === "function") return randomUuid.call((globalThis as any).crypto)
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
        const random = (Math.random() * 16) | 0
        const value = character === "x" ? random : (random & 0x3) | 0x8
        return value.toString(16)
    })
}

function getRetryRequestId(bookingId: string, attempt: any): string {
    const attemptKey = String(attempt || "latest").trim() || "latest"
    const key = `__twn_retry_request_id_v1:${bookingId}:${attemptKey}`
    try {
        const existing = window.sessionStorage.getItem(key)
        if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing
        const next = createUuid()
        window.sessionStorage.setItem(key, next)
        return next
    } catch (_) {
        return createUuid()
    }
}

function retryApiUrl(): string {
    const runtime = resolveRuntimeConfig()
    return runtime.apiBaseUrl
        ? `${runtime.apiBaseUrl}/retry-payment`
        : `${runtime.supabaseUrl}/functions/v1/retry-payment`
}

function retryApiHeaders(): Record<string, string> {
    const runtime = resolveRuntimeConfig()
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (!runtime.apiBaseUrl) {
        headers.apikey = runtime.supabaseAnonKey
        headers.Authorization = `Bearer ${runtime.supabaseAnonKey}`
    }
    return headers
}

async function loadRazorpayScript(): Promise<void> {
    if (typeof window === "undefined") throw new Error("Payment gateway is unavailable")
    if ((window as any).Razorpay) return
    await new Promise<void>((resolve, reject) => {
        const existing = document.querySelector('script[data-twn-razorpay="true"]') as HTMLScriptElement | null
        if (existing) {
            existing.addEventListener("load", () => resolve(), { once: true })
            existing.addEventListener("error", () => reject(new Error("Could not load payment gateway")), { once: true })
            return
        }
        const script = document.createElement("script")
        script.src = "https://checkout.razorpay.com/v1/checkout.js"
        script.async = true
        script.dataset.twnRazorpay = "true"
        script.onload = () => resolve()
        script.onerror = () => reject(new Error("Could not load payment gateway"))
        document.head.appendChild(script)
    })
}

async function openRetryRazorpay(
    payload: any,
    data: BookingData,
    onDismiss: () => void
): Promise<void> {
    const razorpay = payload?.razorpay
    if (!razorpay?.order_id || !razorpay?.key_id) throw new Error("Invalid Razorpay response")
    await loadRazorpayScript()
    const Razorpay = (window as any).Razorpay
    if (typeof Razorpay !== "function") throw new Error("Payment gateway is unavailable")
    const runtime = resolveRuntimeConfig()
    const instance = new Razorpay({
        key: String(razorpay.key_id),
        amount: Number(razorpay.amount || 0),
        currency: String(razorpay.currency || data.currency || "INR"),
        name: "Trip With Nomads",
        description: String(data.trip_title || "Trip booking retry"),
        order_id: String(razorpay.order_id),
        prefill: {
            name: String(data.name || ""),
            email: String(data.email || ""),
            contact: String(data.phone || ""),
        },
        notes: razorpay.notes || {},
        callback_url: razorpay.callback_url || `${runtime.siteBaseUrl}/payment-success`,
        redirect: true,
        modal: { ondismiss: onDismiss },
    })
    instance.on?.("payment.failed", onDismiss)
    instance.open()
}


// ─── TYPES ───────────────────────────────────────────────────

interface BookingData {
    id: string
    trip_id: string
    departure_date: string
    transport?: string
    travellers: Array<{ name: string; sharing: string; transport?: string; vehicle?: string }>
    payment_breakdown: Array<{ label: string; price: number; variant?: string; count?: number }>
    subtotal_amount?: number
    discount_amount?: number
    coupon_code?: string | null
    coupon_snapshot?: any
    tax_amount: number
    total_amount: number
    currency: string
    payment_status: "pending" | "paid" | "failed"
    payment_mode?: "full" | "partial_25"
    payable_now_amount?: number
    paid_amount?: number
    due_amount?: number
    settlement_status?: "pending" | "failed" | "partially_paid" | "fully_paid"
    balance_due_note?: string | null
    payu_txnid: string
    name: string
    email: string
    phone: string
    created_at: string
    // Populated from trips table join
    trip_title?: string
}

type LoadState = "loading" | "ready" | "error"


// ─── SHARED STATE ────────────────────────────────────────────
// All overrides on the page share one booking object.
// withBookingStatus fills it; every other override reads it.

let _data: BookingData | null = null
let _state: LoadState = "loading"
let _subs: Array<() => void> = []
let _pendingCountdown = 0
let _errorMessage = ""

type StatusTextOptions = {
    loadingText: string
    errorText: string
    readyText?: string
    fallbackText: string
}

function statusTextForState(state: LoadState, options: StatusTextOptions): string {
    if (state === "loading") return options.loadingText
    if (state === "error") return options.errorText
    return options.readyText ?? options.fallbackText
}

type StatusIconState = "checking" | "unavailable" | "failed" | "pending" | "success"

function statusIconForState(state: LoadState, paymentStatus?: string): StatusIconState {
    if (state === "loading") return "checking"
    if (state === "error") return "unavailable"
    if (paymentStatus === "failed") return "failed"
    if (paymentStatus === "pending") return "pending"
    if (paymentStatus === "paid") return "success"
    return "unavailable"
}

function shouldShowPaymentSummary(state: LoadState, paymentStatus?: string): boolean {
    return state === "ready" && paymentStatus !== "failed"
}

function notify() { _subs.forEach((fn) => fn()) }

function useBooking(): [BookingData | null, LoadState] {
    const [, bump] = useState(0)
    useEffect(() => {
        const cb = () => bump((n) => n + 1)
        _subs.push(cb)
        return () => { _subs = _subs.filter((s) => s !== cb) }
    }, [])
    return [_data, _state]
}


// ─── HELPERS ─────────────────────────────────────────────────

function fmt(amount: number): string {
    return "₹" + amount.toLocaleString("en-IN")
}

function toNumber(value: any): number {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
}

function resolvedTotalAmount(d: BookingData): number {
    const explicit = Math.max(0, toNumber((d as any)?.total_amount))
    if (explicit > 0) return explicit

    const fromPricingSnapshot = Math.max(
        0,
        toNumber((d as any)?.pricing_snapshot?.total_amount)
    )
    if (fromPricingSnapshot > 0) return fromPricingSnapshot

    const fromPricingSummary = Math.max(
        0,
        toNumber((d as any)?.pricing_summary?.total_amount)
    )
    if (fromPricingSummary > 0) return fromPricingSummary

    const fromBreakdownSummary = Math.max(
        0,
        toNumber((d as any)?.payment_breakdown_summary?.total_amount)
    )
    if (fromBreakdownSummary > 0) return fromBreakdownSummary

    const fromDiscountedPlusTax = Math.max(0, discountedSubtotal(d) + toNumber(d?.tax_amount))
    if (fromDiscountedPlusTax > 0) return fromDiscountedPlusTax

    const fromAmount = Math.max(0, toNumber((d as any)?.amount))
    if (fromAmount > 0) return fromAmount

    return 0
}

function subtotalBeforeDiscount(d: BookingData): number {
    const explicit = toNumber((d as any).subtotal_amount)
    if (explicit > 0) return explicit

    const fallbackDiscounted = toNumber(d.total_amount) - toNumber(d.tax_amount)
    const discount = Math.max(0, toNumber((d as any).discount_amount))
    return Math.max(0, fallbackDiscounted + discount)
}

function discountAmount(d: BookingData): number {
    return Math.max(0, toNumber((d as any).discount_amount))
}

function settlementStatus(d: BookingData): "pending" | "failed" | "partially_paid" | "fully_paid" {
    const explicit = String((d as any)?.settlement_status || "").trim().toLowerCase()
    if (
        explicit === "pending" ||
        explicit === "failed" ||
        explicit === "partially_paid" ||
        explicit === "fully_paid"
    ) {
        return explicit
    }
    if (d.payment_status === "failed") return "failed"
    if (d.payment_status === "paid") {
        const due = Math.max(0, toNumber((d as any)?.due_amount))
        const mode = String((d as any)?.payment_mode || "").trim().toLowerCase()
        if (mode === "partial_25" || due > 0) return "partially_paid"
        return "fully_paid"
    }
    return "pending"
}

function dueAmount(d: BookingData): number {
    const explicit = Math.max(0, toNumber((d as any)?.due_amount))
    if (explicit > 0) return explicit
    const status = settlementStatus(d)
    if (status === "partially_paid") {
        const total = resolvedTotalAmount(d)
        const payableNow = Math.max(0, toNumber((d as any)?.payable_now_amount))
        if (payableNow > 0) return Math.max(0, total - payableNow)
    }
    return 0
}

function paidAmount(d: BookingData): number {
    const explicit = Math.max(0, toNumber((d as any)?.paid_amount))
    if (explicit > 0) return explicit
    const status = settlementStatus(d)
    if (status === "fully_paid") return resolvedTotalAmount(d)
    if (status === "partially_paid") return Math.max(0, toNumber((d as any)?.payable_now_amount))
    return 0
}

function discountedSubtotal(d: BookingData): number {
    return Math.max(0, subtotalBeforeDiscount(d) - discountAmount(d))
}

function bookingRef(data: any): string {
    if (!data) return "#—"
    if (data.booking_ref) return "#" + data.booking_ref
    if (!data.id) return "#—"
    // Fallback: Generate a clean reference from the UUID
    return "#TWN-" + data.id.replace(/-/g, "").slice(0, 8).toUpperCase()
}

function nodeText(node: any): string {
    if (typeof node === "string") return node
    if (typeof node === "number") return String(node)
    if (Array.isArray(node)) return node.map((n) => nodeText(n)).join(" ")
    if (React.isValidElement(node)) return nodeText((node as any).props?.children)
    return ""
}

function normalizeSharingLabel(value: string): string {
    const clean = String(value || "").trim().replace(/\s+/g, " ")
    if (!clean) return ""
    if (/\bsharing\b/i.test(clean)) return clean
    return `${clean} Sharing`
}

function joinMetaParts(parts: Array<string | undefined | null>): string {
    return parts.map((part) => String(part || "").trim()).filter(Boolean).join(" · ")
}

function buildStatusUrl(
    pathname: string,
    bookingId: string,
    statusToken?: string,
    extraParams?: Record<string, string>
) {
    const runtime = resolveRuntimeConfig()
    const base = runtime.siteBaseUrl || (typeof window !== "undefined" ? window.location.origin : "")
    const url = new URL(pathname, base.endsWith("/") ? base : `${base}/`)
    if (bookingId) url.searchParams.set("booking_id", bookingId)
    const token = String(statusToken || "").trim()
    if (token) url.searchParams.set("status_token", token)
    for (const [key, value] of Object.entries(extraParams || {})) {
        url.searchParams.set(key, value)
    }
    return url.toString()
}

// ═════════════════════════════════════════════════════════════
// 1. PAGE-LEVEL: withBookingStatus
//    Apply to the outermost frame. Fetches data once.
// ═════════════════════════════════════════════════════════════

export function withBookingStatus(Component): ComponentType {
    return (props: any) => {
        useEffect(() => {
            let cancelled = false
            const controllers = new Set<AbortController>()
            _data = null
            _state = "loading"
            _pendingCountdown = 0
            _errorMessage = ""

            const fetchBooking = async () => {
                const params = new URLSearchParams(window.location.search)
                const bookingId = normalizeBookingId(params.get("booking_id") || "")
                const statusToken = String(params.get("status_token") || "").trim()
                if (!bookingId) return { error: "No booking_id" }

                const runtime = resolveRuntimeConfig()
                const controller = new AbortController()
                controllers.add(controller)
                const timeout = window.setTimeout(() => controller.abort(), 8000)
                try {
                    const statusRes = await fetch(`${runtime.supabaseUrl}/functions/v1/get-booking-status`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            apikey: runtime.supabaseAnonKey,
                            Authorization: `Bearer ${runtime.supabaseAnonKey}`,
                            "Cache-Control": "no-store",
                        },
                        signal: controller.signal,
                        body: JSON.stringify({
                            booking_id: bookingId,
                            status_token: statusToken,
                        }),
                    })
                    if (statusRes.ok) {
                        const payload = await statusRes.json()
                        if (payload?.booking) return { data: payload.booking }
                    }
                    return { error: `Status request failed (${statusRes.status})` }
                } catch (err) {
                    if (String((err as any)?.name || "") === "AbortError") {
                        return { error: "Status request timed out. Please try again." }
                    }
                    return { error: String(err) }
                } finally {
                    window.clearTimeout(timeout)
                    controllers.delete(controller)
                }
            }

            const go = async () => {
                const params = new URLSearchParams(window.location.search)
                const bookingId = normalizeBookingId(params.get("booking_id") || "")
                const statusToken = String(params.get("status_token") || "").trim()
                const isSuccessRoute = window.location.pathname.includes("/payment-success")
                const successUrl = buildStatusUrl("/payment-success", bookingId, statusToken)
                const failedUrl = buildStatusUrl("/payment-failed", bookingId, statusToken, {
                    reason: "pending-timeout",
                })

                const maybeRedirectOnStatus = (status: string) => {
                    if (status === "paid" && !isSuccessRoute) {
                        window.location.href = successUrl
                        return true
                    }
                    if (status === "failed" && isSuccessRoute) {
                        window.location.href = failedUrl
                        return true
                    }
                    return false
                }

                // 1. Initial fetch
                let result = await fetchBooking()
                if (cancelled) return

                if (result.error) {
                    console.warn("[BookingStatus]", result.error)
                    _errorMessage = result.error
                    _state = "error"
                    notify()
                    return
                }

                _data = result.data
                _state = "ready"
                notify()

                // 2. Poll if pending (max 10 times, 2s interval)
                if (_data.payment_status === "pending") {
                    console.log("[BookingStatus] Status is pending, starting poll...")
                    let attempts = 0
                    while (attempts < 15) {
                        await new Promise((r) => setTimeout(r, 2000))
                        if (cancelled) return
                        attempts++

                        result = await fetchBooking()
                        if (cancelled) return
                        if (!result.data) continue

                        // Update data
                        const newStatus = result.data.payment_status
                        if (newStatus !== _data.payment_status) {
                            console.log("[BookingStatus] Status changed:", newStatus)
                            _data = result.data
                            // Ensure trip_title is preserved
                            if (result.data.trip_title) _data.trip_title = result.data.trip_title
                            notify()

                            if (maybeRedirectOnStatus(newStatus)) return
                        }

                        if (newStatus !== "pending") break
                    }

                    // 3. Still pending after polling:
                    //    show countdown, keep rechecking each second, then route to failed if unresolved.
                    if (_data?.payment_status === "pending") {
                        for (let remaining = 8; remaining > 0; remaining--) {
                            _pendingCountdown = remaining
                            notify()
                            await new Promise((r) => setTimeout(r, 1000))
                            if (cancelled) return

                            const recheck = await fetchBooking()
                            if (cancelled) return
                            if (!recheck?.data) continue

                            const latest = recheck.data
                            const latestStatus = latest.payment_status
                            const changed = _data.payment_status !== latestStatus
                            _data = {
                                ...latest,
                                trip_title: latest.trip_title || _data.trip_title,
                            }
                            notify()

                            if (changed && maybeRedirectOnStatus(latestStatus)) return
                            if (latestStatus !== "pending") break
                        }

                        _pendingCountdown = 0
                        notify()

                        if (_data?.payment_status === "pending" && bookingId) {
                            window.location.href = failedUrl
                            return
                        }
                    }
                }
            }

            go()
            return () => {
                cancelled = true
                controllers.forEach((controller) => controller.abort())
            }
        }, [])

        return <Component {...props} />
    }
}

// ═════════════════════════════════════════════════════════════
// 2. TEXT OVERRIDES
//    Each finds the first text element inside the Framer
//    component and replaces its textContent.
// ═════════════════════════════════════════════════════════════

function textOverride(
    getter: (d: BookingData) => string,
    fallback = "—",
    loadingText = "Loading…",
    errorText = fallback,
) {
    return function (Component: ComponentType): ComponentType {
        return (props: any) => {
            const [data, state] = useBooking()
            const ref = useRef<HTMLDivElement>(null)

            useEffect(() => {
                if (!ref.current) return
                const el = ref.current.querySelector("p, span, h1, h2, h3, h4, h5, h6")
                if (!el) return

                const text = statusTextForState(state, {
                    loadingText,
                    errorText,
                    readyText: data ? getter(data) : undefined,
                    fallbackText: fallback,
                })
                ; (el as HTMLElement).style.opacity = state === "loading" ? "0.72" : "1"
                ; (el as HTMLElement).textContent = text
            }, [data, state])

            return (
                <div ref={ref} style={{ display: "contents" }}>
                    <Component {...props} />
                </div>
            )
        }
    }
}

// --- BOOKING DETAILS CARD ---

export function withBookingId(Component): ComponentType {
    return textOverride((d) => bookingRef(d))(Component)
}

export function withTripName(Component): ComponentType {
    return textOverride((d) => d.trip_title || "—")(Component)
}

export function withDepartureDate(Component): ComponentType {
    return textOverride((d) => d.departure_date || "—")(Component)
}

export function withTransportOption(Component): ComponentType {
    return textOverride((d) => (d.transport ? d.transport : "Seat in Coach"))(Component)
}

// --- TRAVELLER COUNT BADGE ---

export function withTravellerCount(Component): ComponentType {
    return textOverride((d) => {
        const n = d.travellers?.length || 0
        return `${n} Traveller${n !== 1 ? "s" : ""}`
    })(Component)
}

// --- PAYMENT SUMMARY CARD ---

export function withBasePrice(Component): ComponentType {
    return textOverride((d) => {
        return fmt(subtotalBeforeDiscount(d))
    })(Component)
}

export function withSubtotal(Component): ComponentType {
    return textOverride((d) => fmt(discountedSubtotal(d)))(Component)
}

export function withSubtotalBeforeDiscount(Component): ComponentType {
    return textOverride((d) => fmt(subtotalBeforeDiscount(d)))(Component)
}

export function withDiscountAmount(Component): ComponentType {
    return textOverride((d) => `- ${fmt(discountAmount(d))}`)(Component)
}

export function withCouponCode(Component): ComponentType {
    return textOverride((d) => {
        const code = (d as any).coupon_code
        return code ? String(code).toUpperCase() : ""
    })(Component)
}

export function withTaxAmount(Component): ComponentType {
    return textOverride((d) => fmt(d.tax_amount))(Component)
}

// Legacy summary bindings retained for existing success/failure page instances.
// They read the same provider-neutral booking fields as the current bindings.
export function withTaxLabel(Component): ComponentType {
    return textOverride(() => "GST (5%)")(Component)
}

export function withTotalAmount(Component): ComponentType {
    return textOverride((d) => fmt(subtotalBeforeDiscount(d)))(Component)
}

export function withTotalTripCostLabel(Component): ComponentType {
    return textOverride(() => "Total trip cost")(Component)
}

export function withPaymentAmountLabel(Component): ComponentType {
    return textOverride((d) => {
        if (d.payment_status === "paid") return "Payment Status: Paid"
        if (d.payment_status === "failed") return "Payment Status: Failed"
        return "Payment Status: Awaiting confirmation"
    })(Component)
}

export function withTotalPaid(Component): ComponentType {
    return textOverride((d) => {
        const paid = paidAmount(d)
        if (paid > 0) return fmt(paid)
        const total = resolvedTotalAmount(d)
        return fmt(total)
    })(Component)
}

export function withPayableNowAmount(Component): ComponentType {
    return textOverride((d) => fmt(Math.max(0, toNumber((d as any)?.payable_now_amount))))(Component)
}

export function withDueAmount(Component): ComponentType {
    return textOverride((d) => fmt(dueAmount(d)))(Component)
}

export function withBalanceDueNote(Component): ComponentType {
    return textOverride((d) => {
        const due = dueAmount(d)
        if (due <= 0) return ""
        const explicit = String((d as any)?.balance_due_note || "").trim()
        return explicit || `${fmt(due)} due on-site before trip departure.`
    })(Component)
}


// ═════════════════════════════════════════════════════════════
// 3. STATUS / PAYMENT BADGES
//    These are Framer COMPONENTS (not text layers), so the
//    override is applied to the component instance. The
//    textOverride helper finds the first text element inside.
// ═════════════════════════════════════════════════════════════

export function withStatusBadge(Component): ComponentType {
    return textOverride(
        (d) => {
            const status = settlementStatus(d)
            if (status === "fully_paid") return "Confirmed"
            if (status === "partially_paid") return "Confirmed · Balance Due"
            if (d.payment_status === "failed") return "Failed"
            return "Pending"
        },
        "Loading..."
    )(Component)
}

export function withPaymentBadge(Component): ComponentType {
    return textOverride(
        (d) => {
            const status = settlementStatus(d)
            if (status === "fully_paid") return "Paid in Full"
            if (status === "partially_paid") return "Partially Paid"
            if (d.payment_status === "failed") return "Failed"
            return "Pending"
        },
        "…"
    )(Component)
}

export function withDueLabel(Component): ComponentType {
    return textOverride((d) => {
        const status = settlementStatus(d)
        if (status === "fully_paid") return "Settlement Status: Fully settled"
        if (status === "partially_paid") return "Settlement Status: Balance due"
        if (status === "failed") return "Settlement Status: Not settled"
        return "Settlement Status: Pending"
    })(Component)
}

export function withPaymentOutcomeTag(Component): ComponentType {
    return textOverride((d) => {
        const status = settlementStatus(d)
        if (status === "fully_paid" || status === "partially_paid") return "Booking confirmed"
        if (d.payment_status === "failed") return "Payment failed"
        return "Payment processing"
    })(Component)
}

// Use these as separate labels in the status page so gateway confirmation and
// the amount still due are never conflated.
export function withPaymentStatusText(Component): ComponentType {
    return textOverride((d) => {
        if (d.payment_status === "paid") return "Payment Status: Paid"
        if (d.payment_status === "failed") return "Payment Status: Failed"
        return "Payment Status: Awaiting confirmation"
    })(Component)
}

export function withSettlementStatusText(Component): ComponentType {
    return textOverride((d) => {
        const status = settlementStatus(d)
        if (status === "fully_paid") return "Settlement Status: Fully settled"
        if (status === "partially_paid") return `Settlement Status: Balance due (${fmt(dueAmount(d))})`
        if (status === "failed") return "Settlement Status: Not settled"
        return "Settlement Status: Pending"
    })(Component)
}


// ═════════════════════════════════════════════════════════════
// 4. TRAVELLER LIST
//    Apply to the container that holds the "Name" + "Sharing
//    · Email" placeholder. This override clears the container
//    and injects one entry per traveller from the booking.
// ═════════════════════════════════════════════════════════════

export function withTravellerList(Component): ComponentType {
    return (props: any) => {
        const [data, state] = useBooking()
        const travellers = data?.travellers || []
        const rowRefs = useRef<Array<HTMLDivElement | null>>([])
        const childrenArray = React.Children.toArray(props.children)
        const template =
            (childrenArray.find((child) => {
                if (!React.isValidElement(child)) return false
                const text = nodeText((child as any).props?.children).toLowerCase()
                return text.includes("name") || text.includes("sharing") || text.includes("email")
            }) as React.ReactElement | undefined) ||
            (childrenArray.find((child) => React.isValidElement(child)) as React.ReactElement | undefined)

        useEffect(() => {
            if (state !== "ready" || !data || !template || travellers.length === 0) return

            travellers.forEach((traveller, index) => {
                const row = rowRefs.current[index]
                if (!row) return

                const textNodes = Array.from(
                    row.querySelectorAll<HTMLElement>("p, span, h1, h2, h3, h4, h5, h6")
                ).filter((el) => String(el.textContent || "").trim().length > 0)

                if (textNodes.length === 0) return

                const name = String(traveller?.name || "").trim() || `Traveller ${index + 1}`
                const sharing = normalizeSharingLabel(String(traveller?.sharing || ""))
                const vehicle = String(traveller?.vehicle || traveller?.transport || "").trim()
                const email = index === 0 ? String(data.email || "").trim() : ""
                const metaText = joinMetaParts([sharing, vehicle, email])

                const nameNode =
                    textNodes.find((el) => /name/i.test(String(el.textContent || ""))) || textNodes[0]
                const metaNode =
                    textNodes.find((el) => /sharing|email/i.test(String(el.textContent || ""))) ||
                    textNodes[1]

                if (nameNode) nameNode.textContent = name
                if (metaNode) {
                    metaNode.textContent = metaText
                    metaNode.style.whiteSpace = "normal"
                    metaNode.style.overflowWrap = "anywhere"
                    metaNode.style.wordBreak = "break-word"
                }

                // Remove any leftover placeholder nodes like "Sharing", "Email", bullets, etc.
                textNodes.forEach((el) => {
                    if (el === nameNode || el === metaNode) return
                    const lower = String(el.textContent || "").trim().toLowerCase()
                    if (
                        lower === "name" ||
                        lower === "·" ||
                        /\bsharing\b/i.test(lower) ||
                        /\bemail\b/i.test(lower)
                    ) {
                        el.textContent = ""
                        ;(el as HTMLElement).style.display = "none"
                    }
                })
            })
        }, [state, data, template, travellers])

        if (state !== "ready" || !data || !template || travellers.length === 0) {
            return <Component {...props} />
        }

        return (
            <Component
                {...props}
                style={{
                    ...(props.style || {}),
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                }}
            >
                {travellers.map((_, index) => (
                    <div
                        key={`status-traveller-row-${index}`}
                        ref={(el) => {
                            rowRefs.current[index] = el
                        }}
                        style={{ width: "100%" }}
                    >
                        {React.cloneElement(template, {
                            key: `status-traveller-template-${index}`,
                            style: {
                                ...((template.props as any)?.style || {}),
                                width: "100%",
                                position: "relative",
                            },
                        })}
                    </div>
                ))}
            </Component>
        )
    }
}


// ═════════════════════════════════════════════════════════════
// 5. DYNAMIC STATUS OVERRIDES — Unified success/failure page
//    These overrides allow a single page to adapt to both
//    successful and failed payments.
//
// FRAMER SETUP:
//   Apply withStatusIcon     → the ✓ / ✗ icon element
//   Apply withHeadingText    → "Booking Confirmed!" heading
//   Apply withSubheadingText → "Your adventure awaits…" text
//   Apply withRetryButton    → any element to act as "Try Again"
//   Apply withHideOnFailure  → elements to hide when failed
//                               (e.g. Payment Summary card)
// ═════════════════════════════════════════════════════════════

// --- Page heading: "Booking Confirmed!" / "Payment Failed" ---
export function withHeadingText(Component): ComponentType {
    const Wrapped = textOverride(
        (d) => {
            const status = settlementStatus(d)
            if (status === "fully_paid" || status === "partially_paid") return "Booking Confirmed!"
            if (d.payment_status === "failed") return "Payment Failed"
            return "Processing…"
        },
        "We couldn't verify this booking.",
        "Checking payment status…",
        "We couldn't verify this booking.",
    )(Component)
    return Wrapped
}

// --- Page subheading ---
export function withSubheadingText(Component): ComponentType {
    const Wrapped = textOverride(
        (d) => {
            const status = settlementStatus(d)
            if (status === "fully_paid")
                return "Your adventure awaits. Here's everything you need to know."
            if (status === "partially_paid")
                return `Booking confirmed. ${fmt(
                    dueAmount(d)
                )} is due on-site before trip departure.`
            if (d.payment_status === "failed")
                return "Your payment didn't go through. Don't worry, you can try again."
            if (_pendingCountdown > 0) {
                return `We're still confirming your payment. Rechecking and redirecting in ${_pendingCountdown}s.`
            }
            return "We're confirming your payment…"
        },
        "Refresh this page or contact us if the issue continues.",
        "Loading your booking details securely…",
        "Your payment status could not be verified. Please refresh or contact us.",
    )(Component)
    return Wrapped
}

// --- Status icon: swaps the ✅ to ❌ on failure ---
export function withStatusIcon(Component): ComponentType {
    return (props: any) => {
        const [data, state] = useBooking()
        const ref = useRef<HTMLDivElement>(null)
        const originalIconMarkup = useRef<string | null>(null)

        useEffect(() => {
            if (!ref.current) return

            const el = ref.current
            if (originalIconMarkup.current === null) {
                originalIconMarkup.current = el.innerHTML
            }
            const iconState = statusIconForState(state, data?.payment_status)

            if (iconState === "checking") {
                el.innerHTML = `
                    <div role="status" aria-label="Checking payment status" style="
                        width: 64px; height: 64px; border-radius: 50%;
                        background: #e5e7eb; color: #475569; display: flex;
                        align-items: center; justify-content: center;
                        margin: 0 auto; font-size: 30px; font-weight: 600;
                    ">…</div>
                `
                return
            }

            if (iconState === "unavailable") {
                el.innerHTML = `
                    <div role="status" aria-label="Booking status unavailable" style="
                        width: 64px; height: 64px; border-radius: 50%;
                        background: #f59e0b; color: white; display: flex;
                        align-items: center; justify-content: center;
                        margin: 0 auto; font-size: 30px; font-weight: 600;
                    ">!</div>
                `
                return
            }

            if (iconState === "failed") {
                // Replace content with a red ✗ circle
                el.innerHTML = `
                    <div style="
                        width: 64px; height: 64px; border-radius: 50%;
                        background: #ef4444; display: flex;
                        align-items: center; justify-content: center;
                        margin: 0 auto;
                    ">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                    </div>
                `
            } else if (iconState === "pending") {
                el.innerHTML = `
                    <div style="
                        width: 64px; height: 64px; border-radius: 50%;
                        background: #f59e0b; display: flex;
                        align-items: center; justify-content: center;
                        margin: 0 auto;
                    ">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round">
                            <circle cx="12" cy="12" r="10"/>
                            <polyline points="12 6 12 12 16 14"/>
                        </svg>
                    </div>
                `
            } else if (iconState === "success") {
                // Restore the original Framer success icon only after the
                // signed status endpoint confirms the booking is paid.
                el.innerHTML = originalIconMarkup.current || ""
            }
        }, [data, state])

        return (
            <div ref={ref} style={{ display: "contents" }}>
                <Component {...props} />
            </div>
        )
    }
}

// --- Retry button: visible only on failure ---
export function withRetryButton(Component): ComponentType {
    return (props: any) => {
        const [data, state] = useBooking()
        const [isRetrying, setIsRetrying] = useState(false)
        const retryLockRef = useRef(false)

        if (state === "error") {
            return (
                <div
                    onClick={() => window.location.reload()}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") window.location.reload()
                    }}
                    style={{
                        cursor: "pointer",
                        display: "inline-block",
                        padding: "14px 32px",
                        borderRadius: "12px",
                        background: "linear-gradient(135deg, #1b91c9, #0085c1)",
                        color: "#fff",
                        fontSize: "16px",
                        fontWeight: 600,
                        textAlign: "center" as const,
                        marginTop: "16px",
                    }}
                >
                    Retry status
                </div>
            )
        }

        if (state !== "ready" || !data) {
            return <Component {...props} style={{ ...props.style, display: "none" }} />
        }

        if (data.payment_status !== "failed") {
            // A pending attempt must be explicitly expired by the server before retrying.
            return <Component {...props} style={{ ...props.style, display: "none" }} />
        }

        const handleRetry = async () => {
            if (isRetrying || retryLockRef.current) return
            retryLockRef.current = true
            setIsRetrying(true)

            try {
                const retryRequestId = getRetryRequestId(
                    data.id,
                    (data as any).active_payment_attempt_id ||
                        (data as any).payment_attempt_number ||
                        (data as any).payment_attempt ||
                        "latest"
                )
                const res = await fetch(retryApiUrl(), {
                    method: "POST",
                    headers: retryApiHeaders(),
                    body: JSON.stringify({
                        booking_id: data.id,
                        email: String(data.email || "").trim(),
                        retry_request_id: retryRequestId,
                    }),
                })
                if (!res.ok) throw new Error(`Retry failed (${res.status})`)

                const payload = await res.json().catch(() => null)
                if (payload?.gateway === "razorpay" && payload?.razorpay?.order_id) {
                    await openRetryRazorpay(payload, data, () => {
                        retryLockRef.current = false
                        setIsRetrying(false)
                    })
                    return
                }
                const payu = payload?.payu
                if (!payu?.action) throw new Error("Invalid PayU response")

                const form = document.createElement("form")
                form.method = "POST"
                form.action = String(payu.action)
                form.style.display = "none"

                for (const [key, value] of Object.entries(payu)) {
                    if (key === "action") continue
                    const input = document.createElement("input")
                    input.type = "hidden"
                    input.name = key
                    input.value = String(value ?? "")
                    form.appendChild(input)
                }

                document.body.appendChild(form)
                form.submit()
                return
            } catch (err) {
                console.error("[RetryPayment] Error:", err)
                retryLockRef.current = false
                setIsRetrying(false)
                const runtime = resolveRuntimeConfig()
                const domesticTripsBaseUrl = `${runtime.siteBaseUrl}/domestic-trips`
                if (data.trip_id) {
                    window.location.href = `${domesticTripsBaseUrl}/${data.trip_id}`
                } else {
                    window.location.href = domesticTripsBaseUrl
                }
            } finally {
                // Keep the retry locked while the gateway modal is open or the browser is redirecting.
            }
        }

        return (
            <div
                onClick={handleRetry}
                style={{
                    cursor: isRetrying ? "wait" : "pointer",
                    display: "inline-block",
                    padding: "14px 32px",
                    background: isRetrying
                        ? "linear-gradient(135deg, #94a3b8, #64748b)"
                        : "linear-gradient(135deg, #1b91c9, #0085c1)",
                    color: "#fff",
                    borderRadius: "12px",
                    fontSize: "16px",
                    fontWeight: 600,
                    textAlign: "center" as const,
                    marginTop: "16px",
                    transition: "all 0.2s",
                    opacity: isRetrying ? 0.7 : 1,
                    pointerEvents: isRetrying ? "none" : "auto",
                }}
                onMouseEnter={(e) => {
                    if (!isRetrying) (e.target as HTMLElement).style.opacity = "0.85"
                }}
                onMouseLeave={(e) => {
                    if (!isRetrying) (e.target as HTMLElement).style.opacity = "1"
                }}
            >
                {isRetrying ? "Retrying…" : "Try Again"}
            </div>
        )
    }
}

// --- Hide element on failure (e.g. Payment Summary card) ---
export function withHideOnFailure(Component): ComponentType {
    return (props: any) => {
        const [data, state] = useBooking()

        if (!shouldShowPaymentSummary(state, data?.payment_status)) {
            return <Component {...props} style={{ ...props.style, display: "none" }} />
        }

        return <Component {...props} />
    }
}

// Hide element unless a due balance exists (for partial payment cards/rows).
export function withHideWhenNoBalance(Component): ComponentType {
    return (props: any) => {
        const [data, state] = useBooking()
        if (state === "ready" && data && dueAmount(data) <= 0) {
            return <Component {...props} style={{ ...(props.style || {}), display: "none" }} />
        }
        return <Component {...props} />
    }
}

// Hide coupon-related layers when no coupon is applied.
export function withHideWhenNoCoupon(Component): ComponentType {
    return (props: any) => {
        const [data, state] = useBooking()
        const hasCoupon = Boolean(String((data as any)?.coupon_code || "").trim())

        if (state === "ready" && !hasCoupon) {
            return <Component {...props} style={{ ...(props.style || {}), display: "none" }} />
        }
        return <Component {...props} />
    }
}

// Hide discount rows when discount amount is zero.
export function withHideWhenNoDiscount(Component): ComponentType {
    return (props: any) => {
        const [data, state] = useBooking()
        const discount = data ? discountAmount(data) : 0

        if (state === "ready" && discount <= 0) {
            return <Component {...props} style={{ ...(props.style || {}), display: "none" }} />
        }
        return <Component {...props} />
    }
}
