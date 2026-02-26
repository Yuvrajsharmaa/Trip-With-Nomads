import React from "react"
import type { ComponentType } from "react"

const { useEffect, useState } = React

type RuntimeEnv = "production" | "development"
type RuntimeConfig = {
    siteBaseUrl: string
    supabaseUrl: string
    supabaseAnonKey: string
}

const RUNTIME_CONFIG: Record<RuntimeEnv, RuntimeConfig> = {
    production: {
        siteBaseUrl: "https://tripwithnomads.com",
        supabaseUrl: "https://jxozzvwvprmnhvafmpsa.supabase.co",
        supabaseAnonKey:
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp4b3p6dnd2cHJtbmh2YWZtcHNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwNTg2NjIsImV4cCI6MjA4MzYzNDY2Mn0.KpVa9dWlJEguL1TA00Tf4QDpziJ1mgA2I0f4_l-vlOk",
    },
    development: {
        siteBaseUrl: "https://maroon-aside-814100.framer.app",
        supabaseUrl: "https://ieuwiinbvbdvjrdqqzlb.supabase.co",
        supabaseAnonKey:
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlldXdpaW5idmJkdmpyZHFxemxiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwNDYwMTksImV4cCI6MjA4NzYyMjAxOX0.UlTMeyvArixD7byDCrGwEDXsbc4LQfx6QXDL6Je3blE",
    },
}

function resolveRuntimeEnv(): RuntimeEnv {
    if (typeof window === "undefined") return "production"
    const host = String(window.location.hostname || "").trim().toLowerCase()
    if (host === "tripwithnomads.com" || host === "www.tripwithnomads.com") return "production"
    if (
        host === "maroon-aside-814100.framer.app" ||
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
        siteBaseUrl: String(runtimeOverride.siteBaseUrl || selected.siteBaseUrl || "")
            .trim()
            .replace(/\/+$/, ""),
        supabaseUrl: String(runtimeOverride.supabaseUrl || selected.supabaseUrl || "").trim(),
        supabaseAnonKey: String(
            runtimeOverride.supabaseAnonKey || selected.supabaseAnonKey || ""
        ).trim(),
    }
}

const CURRENT_RUNTIME = resolveRuntimeConfig()
const SUPABASE_URL = CURRENT_RUNTIME.supabaseUrl
const SUPABASE_KEY = CURRENT_RUNTIME.supabaseAnonKey

const cache = new Map<string, { ts: number; data: any }>()
const inFlight = new Map<string, Promise<any | null>>()
let forcedTripId = ""

function toNumber(value: any): number {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
}

function fmtINR(value: number): string {
    return "₹" + toNumber(value).toLocaleString("en-IN")
}

function formatNextBatchDate(value: any): string {
    const raw = String(value || "").trim()
    if (!raw) return ""
    const parsed = Date.parse(raw)
    if (!Number.isFinite(parsed)) return ""

    return new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
    }).format(new Date(parsed))
}

function getTripSlugFromPathname(pathname: string): string {
    const clean = String(pathname || "")
    const match = clean.match(/\/upcoming-trips\/([^/?#]+)/i)
    return match?.[1] ? decodeURIComponent(match[1]) : ""
}

function normalizeSlug(value: any): string {
    const raw = String(value || "").trim().toLowerCase()
    if (!raw) return ""

    const fromUrl = raw.match(/\/upcoming-trips\/([^/?#]+)/i)
    const candidate = fromUrl?.[1] ? decodeURIComponent(fromUrl[1]) : raw
    return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(candidate) ? candidate : ""
}

function normalizeTripId(value: any): string {
    const clean = String(value || "").trim()
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clean)) {
        return ""
    }
    return clean
}

function readTripIdCandidate(props: any): string {
    return normalizeTripId(
        props?.tripId ||
            props?.["data-trip-id"] ||
            props?.text ||
            (typeof props?.children === "string" ? props.children : "")
    )
}

function readTripSlugCandidate(props: any): string {
    return normalizeSlug(
        props?.slug ||
            props?.["data-trip-slug"] ||
            props?.href ||
            props?.link ||
            props?.text ||
            (typeof props?.children === "string" ? props.children : "")
    )
}

export function withTripIdSource(Component): ComponentType {
    return (props: any) => {
        const nextTripId = readTripIdCandidate(props)

        useEffect(() => {
            if (nextTripId) {
                forcedTripId = nextTripId
            }
        }, [nextTripId])

        return <Component {...props} />
    }
}

async function fetchTripDisplayPrice(params: { slug?: string; tripId?: string }): Promise<any | null> {
    const slug = String(params.slug || "").trim()
    const tripId = String(params.tripId || "").trim()
    if (!slug && !tripId) return null

    const cacheKey = `${slug}::${tripId}`
    const now = Date.now()
    const cached = cache.get(cacheKey)
    if (cached && now - cached.ts < 120000) return cached.data
    const pending = inFlight.get(cacheKey)
    if (pending) return pending

    const query = new URLSearchParams()
    if (slug) query.set("slug", slug)
    if (tripId) query.set("trip_id", tripId)
    query.set("v", "3")

    const request = fetch(`${SUPABASE_URL}/functions/v1/get-trip-display-price?${query.toString()}`, {
        method: "GET",
        headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
        },
    })
        .then(async (res) => {
            if (!res.ok) return null
            const data = await res.json().catch(() => null)
            if (data) cache.set(cacheKey, { ts: Date.now(), data })
            return data
        })
        .catch(() => null)
        .finally(() => {
            inFlight.delete(cacheKey)
        })

    inFlight.set(cacheKey, request)
    return request
}

function useTripDisplayData(props?: any) {
    const [data, setData] = useState<any>(null)
    const propTripId = readTripIdCandidate(props)
    const propSlug = readTripSlugCandidate(props)

    useEffect(() => {
        let disposed = false
        const query = new URLSearchParams(window.location.search)
        const slugFromPath = getTripSlugFromPathname(window.location.pathname)
        const tripId =
            propTripId || query.get("tripId") || query.get("trip_id") || forcedTripId || ""
        const slug =
            propSlug || slugFromPath || (tripId ? "" : query.get("slug") || "")

        fetchTripDisplayPrice({ slug, tripId })
            .then((payload) => {
                if (disposed) return
                setData(payload || null)
            })
            .catch(() => {
                if (disposed) return
                setData(null)
            })

        return () => {
            disposed = true
        }
    }, [propTripId, propSlug])

    return data
}

export function withTripPrimaryPrice(Component): ComponentType {
    return (props: any) => {
        const tripData = useTripDisplayData(props)
        const summary = tripData?.display_summary
        const value = toNumber(summary?.payable_price)
        const text = value > 0 ? fmtINR(value) : "₹0"
        return <Component {...props} text={text} />
}
}

export function withTripStrikePrice(Component): ComponentType {
    return (props: any) => {
        const tripData = useTripDisplayData(props)
        const summary = tripData?.display_summary
        const base = toNumber(summary?.base_price)
        const payable = toNumber(summary?.payable_price)
        const hasDiscount = Boolean(summary?.has_discount) && base > payable && payable > 0
        if (!hasDiscount) {
            return <Component {...props} text="" visible={false} />
        }
        const text = fmtINR(base)
        return (
            <Component
                {...props}
                text={text}
                visible={true}
                style={{
                    ...(props.style || {}),
                    textDecorationLine: "line-through",
                    textDecoration: "line-through",
                }}
            />
        )
}
}

export function withTripSaveBadge(Component): ComponentType {
    return (props: any) => {
        const tripData = useTripDisplayData(props)
        const summary = tripData?.display_summary
        const save = toNumber(summary?.save_amount)
        const hasDiscount = Boolean(summary?.has_discount) && save > 0
        if (!hasDiscount) {
            return (
                <Component
                    {...props}
                    text=""
                    style={{ ...(props.style || {}), display: "none", pointerEvents: "none" }}
                />
            )
        }
        const text = `Save ${fmtINR(save)}`
        return <Component {...props} text={text} visible={true} />
    }
}

export function withTripHideWhenNoDiscount(Component): ComponentType {
    return (props: any) => {
        const tripData = useTripDisplayData(props)
        const summary = tripData?.display_summary
        const hasDiscount = Boolean(summary?.has_discount) && toNumber(summary?.save_amount) > 0
        if (!hasDiscount) {
            return (
                <Component
                    {...props}
                    style={{ ...(props.style || {}), display: "none", pointerEvents: "none" }}
                />
            )
        }
        return <Component {...props} />
    }
}

export function withTripStartsFromText(Component): ComponentType {
    return (props: any) => {
        const text = "Starts from"
        return <Component {...props} text={text} />
    }
}

export function withTripNextBatchText(Component): ComponentType {
    return (props: any) => {
        const tripData = useTripDisplayData(props)
        const nextBatchLabel = formatNextBatchDate(tripData?.next_batch_date)
        if (!nextBatchLabel) {
            return <Component {...props} text="" visible={false} />
        }

        const text = `Next batch - ${nextBatchLabel}`
        return <Component {...props} text={text} visible={true} />
    }
}
