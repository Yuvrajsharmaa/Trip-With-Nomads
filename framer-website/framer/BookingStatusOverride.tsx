import type { ComponentType } from "react"
import React from "react"

const { useEffect, useRef, useState } = React

// ─────────────────────────────────────────────────────────────
// Booking Status Override — UNIFIED SUCCESS / FAILURE PAGE
//
// HOW IT WORKS:
//   1. handle-payment Edge Function redirects BOTH success
//      and failure to: /payment-success?booking_id=<UUID>
//   2. withBookingStatus reads `booking_id` from URL.
//   3. Fetches the full booking row from Supabase.
//   4. All overrides adapt based on `payment_status`.
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
//   │   Tax (2%)   → value: withTaxAmount             │
//   │   Total Paid → value: withTotalPaid             │
//   ├─────────────────────────────────────────────────┤
//   │ RETRY BUTTON (withRetryButton)                  │
//   │   Hidden on success, visible on failure         │
//   └─────────────────────────────────────────────────┘
//
// ─────────────────────────────────────────────────────────────

// --- CONFIGURATION (same as BookingOverrides.tsx) ---
const SUPABASE_URL = "https://jxozzvwvprmnhvafmpsa.supabase.co"
const SUPABASE_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp4b3p6dnd2cHJtbmh2YWZtcHNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwNTg2NjIsImV4cCI6MjA4MzYzNDY2Mn0.KpVa9dWlJEguL1TA00Tf4QDpziJ1mgA2I0f4_l-vlOk"


// ─── TYPES ───────────────────────────────────────────────────

interface BookingData {
    id: string
    trip_id: string
    departure_date: string
    transport?: string
    travellers: Array<{ name: string; sharing: string }>
    payment_breakdown: Array<{ label: string; price: number; variant?: string; count?: number }>
    subtotal_amount?: number
    discount_amount?: number
    coupon_code?: string | null
    coupon_snapshot?: any
    tax_amount: number
    total_amount: number
    currency: string
    payment_status: "pending" | "paid" | "failed"
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

function initials(name: string): string {
    if (!name) return "?"
    const parts = name.trim().split(/\s+/)
    return parts.length === 1
        ? parts[0][0].toUpperCase()
        : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}


// ═════════════════════════════════════════════════════════════
// 1. PAGE-LEVEL: withBookingStatus
//    Apply to the outermost frame. Fetches data once.
// ═════════════════════════════════════════════════════════════

export function withBookingStatus(Component): ComponentType {
    return (props: any) => {
        useEffect(() => {
            _data = null
            _state = "loading"

            const fetchBooking = async () => {
                const bookingId = new URLSearchParams(window.location.search).get("booking_id")
                if (!bookingId) return { error: "No booking_id" }

                try {
                    // First fetch the booking
                    const res = await fetch(
                        `${SUPABASE_URL}/rest/v1/bookings?id=eq.${bookingId}&select=*`,
                        {
                            headers: {
                                apikey: SUPABASE_KEY,
                                Authorization: `Bearer ${SUPABASE_KEY}`,
                            },
                        }
                    )
                    if (!res.ok) return { error: "HTTP " + res.status }
                    const rows = await res.json()
                    if (!rows?.length) return { error: "Not found" }

                    const booking = rows[0]

                    // Then fetch the trip details since there is no foreign key relation
                    if (booking.trip_id) {
                        try {
                            const tripRes = await fetch(
                                `${SUPABASE_URL}/rest/v1/trips?id=eq.${booking.trip_id}&select=title`,
                                {
                                    headers: {
                                        apikey: SUPABASE_KEY,
                                        Authorization: `Bearer ${SUPABASE_KEY}`,
                                    },
                                }
                            )
                            if (tripRes.ok) {
                                const tripRows = await tripRes.json()
                                if (tripRows?.length) {
                                    booking.trip_title = tripRows[0].title
                                }
                            }
                        } catch (tripErr) {
                            console.warn("Could not fetch trip details:", tripErr)
                        }
                    }

                    return { data: booking }
                } catch (err) {
                    return { error: String(err) }
                }
            }

            const loadTripTitle = async (tripId: string) => {
                try {
                    const res = await fetch(
                        `${SUPABASE_URL}/rest/v1/trips?id=eq.${tripId}&select=title`,
                        {
                            headers: {
                                apikey: SUPABASE_KEY,
                                Authorization: `Bearer ${SUPABASE_KEY}`,
                            },
                        }
                    )
                    if (res.ok) {
                        const rows = await res.json()
                        if (rows?.[0]?.title) {
                            if (_data) {
                                _data.trip_title = rows[0].title
                                notify()
                            }
                        }
                    }
                } catch { }
            }

            const go = async () => {
                // 1. Initial fetch
                let result = await fetchBooking()

                if (result.error) {
                    console.warn("[BookingStatus]", result.error)
                    _state = "error"
                    notify()
                    return
                }

                _data = result.data
                _state = "ready"
                notify()

                if (_data.trip_id) loadTripTitle(_data.trip_id)

                // 2. Poll if pending (max 10 times, 2s interval)
                if (_data.payment_status === "pending") {
                    console.log("[BookingStatus] Status is pending, starting poll...")
                    let attempts = 0
                    while (attempts < 15) {
                        await new Promise((r) => setTimeout(r, 2000))
                        attempts++

                        result = await fetchBooking()
                        if (!result.data) continue

                        // Update data
                        const newStatus = result.data.payment_status
                        if (newStatus !== _data.payment_status) {
                            console.log("[BookingStatus] Status changed:", newStatus)
                            _data = result.data
                            // Ensure trip_title is preserved
                            if (result.data.trip_title) _data.trip_title = result.data.trip_title
                            notify()
                        }

                        if (newStatus !== "pending") break
                    }
                }
            }

            go()
        }, [])

        return <Component {...props} />
    }
}

// ═════════════════════════════════════════════════════════════
// DEBUG: View Raw Data
// ═════════════════════════════════════════════════════════════

export function withDebugOverlay(Component): ComponentType {
    return (props: any) => {
        const [data, state] = useBooking()
        if (!data) return <Component {...props} />

        return (
            <div style={{ position: "relative" }}>
                <Component {...props} />
                <div style={{
                    position: "fixed",
                    bottom: 10,
                    right: 10,
                    background: "rgba(0,0,0,0.8)",
                    color: "#0f0",
                    padding: 10,
                    fontSize: 10,
                    zIndex: 9999,
                    pointerEvents: "none",
                    maxWidth: 300,
                    overflow: "hidden"
                }}>
                    <pre>{JSON.stringify({
                        id: data.id?.slice(0, 4),
                        status: data.payment_status,
                        ref: data.booking_ref,
                        amount: data.total_amount
                    }, null, 2)}</pre>
                </div>
            </div>
        )
    }
}


// ═════════════════════════════════════════════════════════════
// 2. TEXT OVERRIDES
//    Each finds the first text element inside the Framer
//    component and replaces its textContent.
// ═════════════════════════════════════════════════════════════

function textOverride(getter: (d: BookingData) => string, fallback = "—") {
    return function (Component: ComponentType): ComponentType {
        return (props: any) => {
            const [data, state] = useBooking()
            const ref = useRef<HTMLDivElement>(null)

            useEffect(() => {
                if (!ref.current) return
                const el = ref.current.querySelector("p, span, h1, h2, h3, h4, h5, h6")
                if (!el) return

                if (state === "loading") {
                    ; (el as HTMLElement).style.opacity = "0.4"
                    return
                }

                ; (el as HTMLElement).style.opacity = "1"

                if (state === "ready" && data) {
                    ; (el as HTMLElement).textContent = getter(data)
                } else {
                    ; (el as HTMLElement).textContent = fallback
                }
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
        const breakdown = (d.payment_breakdown || []).filter(
            (item) => String(item?.variant || "").toLowerCase() !== "coupon"
        )
        if (breakdown.length === 0) return fmt(d.total_amount - d.tax_amount)
        if (breakdown.length === 1) {
            const b = breakdown[0]
            const count = b.count || 1
            return count > 1 ? `${fmt(b.price)} × ${count}` : fmt(b.price)
        }
        return breakdown
            .map((b) => {
                const count = b.count || 1
                return count > 1 ? `${fmt(b.price)} × ${count}` : fmt(b.price)
            })
            .join(" + ")
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
        return code ? String(code).toUpperCase() : "No coupon"
    })(Component)
}

export function withTaxAmount(Component): ComponentType {
    return textOverride((d) => fmt(d.tax_amount))(Component)
}

export function withTotalPaid(Component): ComponentType {
    return textOverride((d) => fmt(d.total_amount))(Component)
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
            if (d.payment_status === "paid") return "✓ Confirmed"
            if (d.payment_status === "failed") return "✗ Failed"
            return "⏳ Pending"
        },
        "⏳ Loading…"
    )(Component)
}

export function withPaymentBadge(Component): ComponentType {
    return textOverride(
        (d) => {
            if (d.payment_status === "paid") return "Paid"
            if (d.payment_status === "failed") return "Failed"
            return "Pending"
        },
        "…"
    )(Component)
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
        const ref = useRef<HTMLDivElement>(null)

        useEffect(() => {
            if (state !== "ready" || !data || !ref.current) return

            const container = ref.current
            const travellers = data.travellers || []

            // Clear Framer placeholder content
            container.innerHTML = ""

            if (travellers.length === 0) {
                container.innerHTML = `
                    <div style="color:#999; font-size:14px; padding:8px 0;">
                        No traveller details recorded.
                    </div>
                `
                return
            }

            // Inject styles once
            const style = document.createElement("style")
            style.textContent = `
                .twn-t { display:flex; align-items:center; gap:12px; padding:12px 0; border-bottom:1px solid #eee; }
                .twn-t:last-child { border-bottom:none; }
                .twn-av { width:36px; height:36px; border-radius:50%; background:linear-gradient(135deg,#6366f1,#a855f7); display:flex; align-items:center; justify-content:center; font-size:13px; font-weight:700; color:#fff; flex-shrink:0; }
                .twn-ti { flex:1; }
                .twn-tn { font-size:14px; font-weight:600; color:#1a1a1a; margin:0; }
                .twn-td { font-size:13px; color:#888; margin:2px 0 0 0; }
            `
            container.appendChild(style)

            // Build traveller rows
            travellers.forEach((t, i) => {
                const name = t.name || `Traveller ${i + 1}`
                const sharing = (t.sharing || "—").charAt(0).toUpperCase() + (t.sharing || "—").slice(1)
                const emailPart = i === 0 && data.email ? ` · ${data.email}` : ""

                const row = document.createElement("div")
                row.className = "twn-t"
                row.innerHTML = `
                    <div class="twn-av">${initials(name)}</div>
                    <div class="twn-ti">
                        <p class="twn-tn">${name}</p>
                        <p class="twn-td">${sharing} Sharing${emailPart}</p>
                    </div>
                `
                container.appendChild(row)
            })
        }, [data, state])

        return (
            <div ref={ref} style={{ width: "100%", minHeight: "20px" }}>
                <Component {...props} />
            </div>
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
            if (d.payment_status === "paid") return "Booking Confirmed!"
            if (d.payment_status === "failed") return "Payment Failed"
            return "Processing…"
        },
        "Loading…"
    )(Component)
    return Wrapped
}

// --- Page subheading ---
export function withSubheadingText(Component): ComponentType {
    const Wrapped = textOverride(
        (d) => {
            if (d.payment_status === "paid")
                return "Your adventure awaits. Here's everything you need to know."
            if (d.payment_status === "failed")
                return "Your payment didn't go through. Don't worry, you can try again."
            return "We're confirming your payment…"
        },
        ""
    )(Component)
    return Wrapped
}

// --- Status icon: swaps the ✅ to ❌ on failure ---
export function withStatusIcon(Component): ComponentType {
    return (props: any) => {
        const [data, state] = useBooking()
        const ref = useRef<HTMLDivElement>(null)

        useEffect(() => {
            if (!ref.current || state !== "ready" || !data) return

            const el = ref.current
            const isFailed = data.payment_status === "failed"
            const isPending = data.payment_status === "pending"

            // Try to find an SVG or img inside
            const svg = el.querySelector("svg")
            const img = el.querySelector("img")

            if (isFailed) {
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
            } else if (isPending) {
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
            }
            // On "paid", leave the original ✅ icon from Framer
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

        if (state !== "ready" || !data) {
            return <Component {...props} style={{ ...props.style, display: "none" }} />
        }

        if (data.payment_status === "paid") {
            // Hide on success
            return <Component {...props} style={{ ...props.style, display: "none" }} />
        }

        // Show on failure or pending — clickable "Try Again" that goes back
        const handleRetry = () => {
            // Navigate back to the trip page if we have a trip_id
            if (data.trip_id) {
                window.location.href = `/domestic-trips/${data.trip_id}`
            } else {
                window.location.href = "/domestic-trips"
            }
        }

        return (
            <div
                onClick={handleRetry}
                style={{
                    cursor: "pointer",
                    display: "inline-block",
                    padding: "14px 32px",
                    background: "linear-gradient(135deg, #1b91c9, #0085c1)",
                    color: "#fff",
                    borderRadius: "12px",
                    fontSize: "16px",
                    fontWeight: 600,
                    textAlign: "center" as const,
                    marginTop: "16px",
                    transition: "opacity 0.2s",
                }}
                onMouseEnter={(e) => { (e.target as HTMLElement).style.opacity = "0.85" }}
                onMouseLeave={(e) => { (e.target as HTMLElement).style.opacity = "1" }}
            >
                ← Try Again
            </div>
        )
    }
}

// --- Hide element on failure (e.g. Payment Summary card) ---
export function withHideOnFailure(Component): ComponentType {
    return (props: any) => {
        const [data, state] = useBooking()

        if (state === "ready" && data && data.payment_status === "failed") {
            return <Component {...props} style={{ ...props.style, display: "none" }} />
        }

        return <Component {...props} />
    }
}
