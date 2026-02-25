import type { ComponentType } from "react"
import React from "react"

const { useEffect, useRef, useState } = React

// ─────────────────────────────────────────────────────────────
// Booking Status Override — UNIFIED SUCCESS / FAILURE PAGE
//
// HOW IT WORKS:
//   1. handle-payment Edge Function redirects BOTH success
//      and failure to:
//         /payment-success?booking_id=<UUID> or
//         /payment-failed?booking_id=<UUID>
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
        return code ? String(code).toUpperCase() : ""
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
                if (metaNode) metaNode.textContent = metaText

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
