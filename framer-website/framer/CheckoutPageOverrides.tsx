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

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_REGEX = /^\+?[\d\s\-()]{10,15}$/
let checkoutBootstrapped = false
let checkoutBootstrapInFlight = false

type Traveller = {
    id: number
    name: string
    transport: string
    sharing: string
}

type CouponResult = {
    valid: boolean
    code?: string
    discount_type?: "percent" | "fixed"
    discount_value?: number
    discount_amount?: number
    min_subtotal?: number
    message?: string
}

type TravellerContextValue = { id: number; index: number }
const TravellerContext = createContext<TravellerContextValue | null>(null)

const useStore = createStore({
    tripId: "",
    slug: "",
    tripName: "",
    pricingData: [] as any[],
    date: "",
    transport: "",
    travellers: [{ id: 1, name: "", transport: "", sharing: "" }] as Traveller[],
    contactName: "",
    contactPhone: "",
    contactEmail: "",
    couponCode: "",
    appliedCoupon: null as CouponResult | null,
    couponMessage: "Enter a coupon code and tap Apply.",
    couponMessageType: "neutral" as "neutral" | "success" | "error",
    loading: false,
    submitting: false,
})

function toNumber(value: any): number {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
}

function round2(value: number): number {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100
}

function fmtINR(value: number): string {
    return "₹" + toNumber(value).toLocaleString("en-IN")
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
            sharing: typeof item?.sharing === "string" ? item.sharing : "",
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

function getVariantValue(row: any): string {
    return row?.variant_name || row?.sharing || ""
}

function getTransportValue(row: any): string {
    return row?.transport || "Seat in Coach"
}

function getDateOptions(pricing: any[]): string[] {
    return [...new Set((pricing || []).map((row: any) => getDateValue(row)).filter(Boolean))].sort()
}

function getTransportOptions(pricing: any[], date: string): string[] {
    const filtered = (pricing || []).filter((row: any) => !date || getDateValue(row) === date)
    const options = [...new Set(filtered.map((row: any) => getTransportValue(row)).filter(Boolean))].sort()
    return options.length > 0 ? options : ["Seat in Coach"]
}

function getSharingOptions(pricing: any[], date: string, transport?: string): string[] {
    const filtered = (pricing || []).filter(
        (row: any) =>
            (!date || getDateValue(row) === date) &&
            (!transport || getTransportValue(row) === transport)
    )
    return [...new Set(filtered.map((row: any) => getVariantValue(row)).filter(Boolean))].sort()
}

function resolvePriceForTraveller(pricing: any[], date: string, transport: string, sharing: string): number {
    if (!date || !sharing) return 0
    const row = (pricing || []).find(
        (item: any) =>
            getDateValue(item) === date &&
            getTransportValue(item) === transport &&
            getVariantValue(item) === sharing
    )
    return toNumber(row?.price)
}

function normalizeTravellerTransport(
    pricing: any[],
    date: string,
    value: string,
    fallback = "Seat in Coach"
): string {
    const options = getTransportOptions(pricing, date)
    if (value && options.includes(value)) return value
    if (fallback && options.includes(fallback)) return fallback
    return options[0] || "Seat in Coach"
}

function sanitizeTravellersForDate(
    pricing: any[],
    date: string,
    travellersInput: Traveller[],
    fallbackTransport = "Seat in Coach"
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
    const pricingData = store?.pricingData || []
    const travellers = normalizeTravellers(store?.travellers || [])

    let subtotal = 0
    const groups: Record<string, { count: number; unit: number }> = {}

    for (const traveller of travellers) {
        const transport = traveller.transport || "Seat in Coach"
        const sharing = traveller.sharing
        if (!sharing) continue

        const price = resolvePriceForTraveller(pricingData, store.date, transport, sharing)
        if (price <= 0) continue

        subtotal += price
        const key = `${transport}__${sharing}`
        if (!groups[key]) groups[key] = { count: 0, unit: price }
        groups[key].count += 1
    }

    const discountRaw = toNumber(store?.appliedCoupon?.discount_amount)
    const discount = Math.min(Math.max(0, discountRaw), subtotal)
    const taxableSubtotal = Math.max(0, subtotal - discount)
    const tax = round2(taxableSubtotal * TAX_RATE)
    const total = round2(taxableSubtotal + tax)

    const breakdown = Object.entries(groups).map(([key, data]) => {
        const parts = key.split("__")
        const transport = parts[0] || "Seat in Coach"
        const variant = parts[1] || ""
        return {
            label: `${data.count}x Guest (${variant}${transport ? ` · ${transport}` : ""})`,
            count: data.count,
            variant,
            transport,
            unit_price: data.unit,
            price: data.unit * data.count,
        }
    })

    return {
        subtotal: round2(subtotal),
        discount: round2(discount),
        taxableSubtotal: round2(taxableSubtotal),
        tax,
        total,
        breakdown,
    }
}

function getValidationErrors(store: any): string[] {
    const errors: string[] = []

    if (!store?.tripId) errors.push("Trip ID missing")
    if (!store?.date) errors.push("Departure date is required")

    if (!store?.contactName?.trim()) errors.push("Contact name is required")
    if (!store?.contactPhone?.trim()) errors.push("Phone number is required")
    else if (!PHONE_REGEX.test(store.contactPhone.trim())) errors.push("Phone number is invalid")

    if (!store?.contactEmail?.trim()) errors.push("Email is required")
    else if (!EMAIL_REGEX.test(store.contactEmail.trim())) errors.push("Email is invalid")

    const travellers = normalizeTravellers(store?.travellers || [])
    travellers.forEach((t, index) => {
        if (!t.name.trim()) errors.push(`Name required for Traveller ${index + 1}`)
        if (!t.transport) errors.push(`Vehicle required for Traveller ${index + 1}`)
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

function toTitleFromSlug(slug: string): string {
    const clean = String(slug || "").trim()
    if (!clean) return ""
    return clean
        .replace(/[-_]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
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

        useEffect(() => {
            if (
                checkoutBootstrapped ||
                checkoutBootstrapInFlight ||
                (store?.tripId && Array.isArray(store?.pricingData) && store.pricingData.length > 0)
            ) {
                return
            }
            let disposed = false
            checkoutBootstrapInFlight = true

            const run = async () => {
                const query = new URLSearchParams(window.location.search)
                setStore({ loading: true })
                let tripId = query.get("tripId") || query.get("trip_id") || ""
                const slug = query.get("slug") || ""
                const queryDate = query.get("date") || ""
                const queryTransport = query.get("vehicle") || query.get("transport") || ""

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

                const pricing = await fetchTripPricing(tripId)
                if (disposed) return

                const dates = getDateOptions(pricing)
                const date = dates.includes(queryDate) ? queryDate : dates[0] || ""
                const transports = getTransportOptions(pricing, date)
                const transport = transports.includes(queryTransport)
                    ? queryTransport
                    : transports[0] || "Seat in Coach"
                const travellers = sanitizeTravellersForDate(
                    pricing,
                    date,
                    normalizeTravellers(store.travellers || []),
                    transport
                )

                setStore({
                    tripId,
                    slug: slug || "",
                    tripName: toTitleFromSlug(slug) || tripId,
                    pricingData: pricing,
                    date,
                    transport,
                    travellers,
                    loading: false,
                })
                checkoutBootstrapped = true
                checkoutBootstrapInFlight = false

                console.log("[Checkout] Opened", {
                    tripId,
                    slug,
                    date,
                    defaultTransport: transport,
                })
            }

            run().catch((err) => {
                console.error("[Checkout] Bootstrap failed", err)
                checkoutBootstrapInFlight = false
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
                checkoutBootstrapInFlight = false
            }
        }, [])

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
                : transports[0] || "Seat in Coach"
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
        const travellerTransport = traveller?.transport || store.transport || "Seat in Coach"
        const options = useMemo(
            () => getSharingOptions(store.pricingData || [], store.date, travellerTransport),
            [store.pricingData, store.date, travellerTransport]
        )

        const handleChange = (value: string) => {
            const next = updateTravellerById(store, ctx.id, { sharing: value })
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
            store.transport || "Seat in Coach"
        )

        const handleChange = (value: string) => {
            const normalized = normalizeTravellerTransport(
                store.pricingData || [],
                store.date,
                value,
                store.transport || "Seat in Coach"
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
                        "Seat in Coach"
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
                        transport: t.transport || "Seat in Coach",
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
                        couponMessageType: "error",
                        couponMessage:
                            data?.message || data?.error || `Coupon failed (HTTP ${res.status})`,
                    })
                    console.log("[Checkout] Coupon apply failed", data)
                    return
                }

                setStore({
                    appliedCoupon: {
                        valid: true,
                        code: data.code,
                        discount_type: data.discount_type,
                        discount_value: toNumber(data.discount_value),
                        discount_amount: toNumber(data.discount_amount),
                        min_subtotal: toNumber(data.min_subtotal),
                        message: data.message,
                    },
                    couponCode: data.code || code,
                    couponMessageType: "success",
                    couponMessage: data.message || `Coupon ${data.code || code} applied`,
                })

                console.log("[Checkout] Coupon apply success", data)
            } catch (err: any) {
                setStore({
                    appliedCoupon: null,
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
        const color =
            store.couponMessageType === "success"
                ? "#15803d"
                : store.couponMessageType === "error"
                  ? "#dc2626"
                  : "#6b7280"

        return (
            <Component
                {...props}
                text={store.couponMessage || "Enter a coupon code and tap Apply."}
                style={{ ...(props.style || {}), color }}
            />
        )
    }
}

export function withCheckoutSubtotal(Component): ComponentType {
    return withTextFromState((store) => fmtINR(computeTotals(store).subtotal))(Component)
}

export function withCheckoutDiscount(Component): ComponentType {
    return withTextFromState((store) => `- ${fmtINR(computeTotals(store).discount)}`)(Component)
}

export function withCheckoutDiscountLabel(Component): ComponentType {
    return withTextFromState((store) => {
        const code = store?.appliedCoupon?.code
        return code ? `Discount (${code})` : "Discount"
    })(Component)
}

export function withCheckoutTax(Component): ComponentType {
    return withTextFromState((store) => fmtINR(computeTotals(store).tax))(Component)
}

export function withCheckoutTotal(Component): ComponentType {
    return withTextFromState((store) => fmtINR(computeTotals(store).total))(Component)
}

export function withCheckoutValidationHint(Component): ComponentType {
    return withTextFromState((store) => {
        if (!store?.date) return "Select departure date."

        const travellers = normalizeTravellers(store?.travellers || [])
        const travellerMissing = travellers.some(
            (t) => !t.name?.trim() || !t.sharing || !t.transport
        )
        if (travellerMissing) return "Complete traveller details (name, sharing, vehicle)."

        if (!store?.contactName?.trim() || !store?.contactPhone?.trim() || !store?.contactEmail?.trim()) {
            return "Enter contact name, phone and email."
        }

        const totals = computeTotals(store)
        if (totals.total <= 0) return "Select valid sharing options to calculate total."

        return "Ready to pay"
    })(Component)
}

export function withCheckoutPayButton(Component): ComponentType {
    return (props: any) => {
        const [store, setStore] = useStore()
        const totals = computeTotals(store)
        const errors = getValidationErrors(store)
        const isValid = errors.length === 0

        const submit = async () => {
            if (!isValid || store.submitting) return

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
                transport: String(t.transport || "Seat in Coach").trim() || "Seat in Coach",
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
