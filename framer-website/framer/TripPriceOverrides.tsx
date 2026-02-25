import React from "react"
import type { ComponentType } from "react"

const { useEffect, useState } = React

const SUPABASE_URL = "https://jxozzvwvprmnhvafmpsa.supabase.co"
const SUPABASE_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp4b3p6dnd2cHJtbmh2YWZtcHNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwNTg2NjIsImV4cCI6MjA4MzYzNDY2Mn0.KpVa9dWlJEguL1TA00Tf4QDpziJ1mgA2I0f4_l-vlOk"

const cache = new Map<string, { ts: number; data: any }>()

function toNumber(value: any): number {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
}

function fmtINR(value: number): string {
    return "₹" + toNumber(value).toLocaleString("en-IN")
}

function getTripSlugFromPathname(pathname: string): string {
    const clean = String(pathname || "")
    const match = clean.match(/\/upcoming-trips\/([^/?#]+)/i)
    return match?.[1] ? decodeURIComponent(match[1]) : ""
}

async function fetchTripDisplayPrice(params: { slug?: string; tripId?: string }): Promise<any | null> {
    const slug = String(params.slug || "").trim()
    const tripId = String(params.tripId || "").trim()
    if (!slug && !tripId) return null

    const cacheKey = `${slug}::${tripId}`
    const now = Date.now()
    const cached = cache.get(cacheKey)
    if (cached && now - cached.ts < 120000) return cached.data

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
    if (data) cache.set(cacheKey, { ts: now, data })
    return data
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
