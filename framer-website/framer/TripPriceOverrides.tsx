import React from "react"
import type { ComponentType } from "react"

const { useEffect, useState } = React

type RuntimeEnv = "production" | "development"
type RuntimeConfig = {
    siteBaseUrl: string
    apiBaseUrl: string
    fallbackApiBaseUrl?: string
    supabaseUrl: string
    supabaseAnonKey: string
}

const RUNTIME_CONFIG: Record<RuntimeEnv, RuntimeConfig> = {
    production: {
        siteBaseUrl: "https://tripwithnomads.com",
        apiBaseUrl: "/api/checkout",
        fallbackApiBaseUrl: "https://twn-checkout-gateway.tripwithnomads-crm.workers.dev/api/checkout",
        supabaseUrl: "",
        supabaseAnonKey: "",
    },
    development: {
        siteBaseUrl: "https://maroon-aside-814100.framer.app",
        apiBaseUrl: "http://localhost:8787/api/checkout",
        supabaseUrl: "https://ieuwiinbvbdvjrdqqzlb.supabase.co",
        supabaseAnonKey:
            "__SUPABASE_ANON_KEY_DEVELOPMENT__",
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

function extractProjectRefFromSupabaseUrl(url: string): string {
    const match = String(url || "")
        .trim()
        .match(/^https:\/\/([a-z0-9-]+)\.supabase\.co(?:\/|$)/i)
    return String(match?.[1] || "").trim().toLowerCase()
}

function decodeBase64Url(value: string): string {
    const normalized = String(value || "")
        .trim()
        .replace(/-/g, "+")
        .replace(/_/g, "/")
    if (!normalized) return ""
    const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4)
    try {
        if (typeof atob === "function") return atob(padded)
    } catch (_) { }
    try {
        // @ts-ignore Framer runtime may expose Buffer in some contexts.
        if (typeof Buffer !== "undefined") return Buffer.from(padded, "base64").toString("utf8")
    } catch (_) { }
    return ""
}

function extractProjectRefFromAnonKey(key: string): string {
    const parts = String(key || "").trim().split(".")
    if (parts.length < 2) return ""
    const payloadRaw = decodeBase64Url(parts[1])
    if (!payloadRaw) return ""
    try {
        const payload = JSON.parse(payloadRaw)
        return String(payload?.ref || "").trim().toLowerCase()
    } catch (_) {
        return ""
    }
}

function pickSupabaseAnonKey(url: string, overrideKey: string, selectedKey: string): string {
    const targetRef = extractProjectRefFromSupabaseUrl(url)
    const cleanOverride = String(overrideKey || "").trim()
    const cleanSelected = String(selectedKey || "").trim()
    if (!targetRef) return cleanOverride || cleanSelected

    const overrideRef = extractProjectRefFromAnonKey(cleanOverride)
    if (cleanOverride && overrideRef === targetRef) return cleanOverride

    const selectedRef = extractProjectRefFromAnonKey(cleanSelected)
    if (cleanSelected && selectedRef === targetRef) return cleanSelected

    return cleanOverride || cleanSelected
}

function resolveRuntimeConfig(): RuntimeConfig {
    const env = resolveRuntimeEnv()
    const selected = RUNTIME_CONFIG[env]
    const runtimeOverride =
        typeof window !== "undefined" ? (window as any).__TWN_RUNTIME_CONFIG__ || {} : {}
    const resolvedSupabaseUrl = String(runtimeOverride.supabaseUrl || selected.supabaseUrl || "").trim()
    const resolvedSupabaseAnonKey = pickSupabaseAnonKey(
        resolvedSupabaseUrl,
        String(runtimeOverride.supabaseAnonKey || ""),
        String(selected.supabaseAnonKey || "")
    )
    return {
        siteBaseUrl: String(runtimeOverride.siteBaseUrl || selected.siteBaseUrl || "")
            .trim()
            .replace(/\/+$/, ""),
        apiBaseUrl: String(runtimeOverride.apiBaseUrl || selected.apiBaseUrl || "")
            .trim()
            .replace(/\/+$/, ""),
        fallbackApiBaseUrl: String(
            runtimeOverride.fallbackApiBaseUrl || selected.fallbackApiBaseUrl || ""
        )
            .trim()
            .replace(/\/+$/, ""),
        supabaseUrl: resolvedSupabaseUrl,
        supabaseAnonKey: resolvedSupabaseAnonKey,
    }
}

const CURRENT_RUNTIME = resolveRuntimeConfig()
const RUNTIME_ENV = resolveRuntimeEnv()
const GATEWAY_BASE = CURRENT_RUNTIME.apiBaseUrl
const GATEWAY_FALLBACK_BASE = CURRENT_RUNTIME.fallbackApiBaseUrl || ""
const SUPABASE_URL = CURRENT_RUNTIME.supabaseUrl
const SUPABASE_KEY = CURRENT_RUNTIME.supabaseAnonKey
const FORCE_DIRECT_SUPABASE =
    typeof window !== "undefined" && Boolean((window as any).__TWN_CHECKOUT_FORCE_DIRECT_SUPABASE__)
const FORCE_GATEWAY =
    typeof window !== "undefined" && Boolean((window as any).__TWN_CHECKOUT_FORCE_GATEWAY__)
const USE_GATEWAY =
    FORCE_GATEWAY || (!FORCE_DIRECT_SUPABASE && RUNTIME_ENV === "production" && Boolean(GATEWAY_BASE))

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

function normalizeGatewayBase(value: string): string {
    const clean = String(value || "").trim().replace(/\/+$/, "")
    if (!clean) return ""
    if (/^https?:\/\//i.test(clean)) return clean
    if (typeof window !== "undefined" && clean.startsWith("/")) {
        return `${window.location.origin}${clean}`.replace(/\/+$/, "")
    }
    return clean
}

const GATEWAY_CANDIDATES = [normalizeGatewayBase(GATEWAY_BASE), normalizeGatewayBase(GATEWAY_FALLBACK_BASE)]
    .filter(Boolean)
    .filter((value, index, arr) => arr.indexOf(value) === index)

function shouldFallbackGateway(response: Response, requestUrl: string): boolean {
    if (response.ok) return false
    let sameOrigin = false
    try {
        const parsed = new URL(requestUrl)
        sameOrigin =
            typeof window !== "undefined" &&
            parsed.origin === window.location.origin
    } catch (_) { }
    if (sameOrigin && response.status === 404) return true
    const server = String(response.headers.get("server") || "").toLowerCase()
    const contentType = String(response.headers.get("content-type") || "").toLowerCase()
    return (
        (response.status === 404 || response.status === 405) &&
        (server.includes("framer") || contentType.includes("text/html"))
    )
}

async function fetchGateway(path: string, init: RequestInit = {}, params?: URLSearchParams): Promise<Response> {
    const endpoint = String(path || "").trim().replace(/^\/+/, "")
    const query = params?.toString() || ""
    const candidates = GATEWAY_CANDIDATES.length ? GATEWAY_CANDIDATES : [normalizeGatewayBase(GATEWAY_BASE)].filter(Boolean)
    let lastError: any = null

    for (let index = 0; index < candidates.length; index += 1) {
        const base = String(candidates[index] || "").trim().replace(/\/+$/, "")
        const requestUrl = `${base}/${endpoint}${query ? `?${query}` : ""}`
        try {
            const response = await fetch(requestUrl, {
                ...init,
                headers: {
                    ...(init.headers || {}),
                },
            })
            const hasFallback = index < candidates.length - 1
            if (hasFallback && shouldFallbackGateway(response, requestUrl)) {
                continue
            }
            return response
        } catch (error) {
            lastError = error
            if (index >= candidates.length - 1) throw error
        }
    }

    throw lastError || new Error("Gateway request failed")
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

    const request = (USE_GATEWAY
        ? fetchGateway("display-price", { method: "GET", priority: "high" as any }, query)
        : fetch(`${SUPABASE_URL}/functions/v1/get-trip-display-price?${query.toString()}`, {
              method: "GET",
              priority: "high",
              headers: {
                  apikey: SUPABASE_KEY,
                  Authorization: `Bearer ${SUPABASE_KEY}`,
              },
          } as any))
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
