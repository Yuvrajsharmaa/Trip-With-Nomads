import React from "react"
import type { ComponentType } from "react"
import { createStore } from "https://framer.com/m/framer/store.js@^1.0.0"

const { createContext, useContext, useEffect, useMemo, useCallback, useRef, useState } = React

// --- CONFIGURATION ---
const SUPABASE_URL = "https://jxozzvwvprmnhvafmpsa.supabase.co"
const SUPABASE_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp4b3p6dnd2cHJtbmh2YWZtcHNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwNTg2NjIsImV4cCI6MjA4MzYzNDY2Mn0.KpVa9dWlJEguL1TA00Tf4QDpziJ1mgA2I0f4_l-vlOk"
const TAX_RATE = 0.02

// --- CONTEXT ---
// TravellerContext provides the current index for components inside the withTravellerList repeater.
const TravellerContext = createContext<number | null>(null)

// --- STORE ---
const useStore = createStore({
    tripId: "",
    pricingData: [],
    date: "",
    contactName: "",
    contactPhone: "",
    contactEmail: "",
    travellers: [{ id: 1, name: "", sharing: "" }],
    loading: false,
    errors: {},
    step: 1,
})


// =====================================================
// STEP NAVIGATION CONTROLLER
// =====================================================
const STEP_TO_VARIANT: Record<number, string> = {
    1: "Varient details",
    2: "Traveller details",
    3: "Payment details",
}

export function withBookingModal(Component): ComponentType {
    return (props: any) => {
        const [store] = useStore()
        const targetVariant = STEP_TO_VARIANT[store.step] || props.variant
        return <Component {...props} variant={targetVariant} />
    }
}


// --- DOM HELPER: Populate a native <select> by name or element ---
function populateDropdown(select: HTMLSelectElement, options: string[], formatLabel?: (s: string) => string) {
    if (!select) return

    const firstOption = select.options[0]
    const placeholderText =
        firstOption && (firstOption.value === "" || firstOption.text.toLowerCase().includes("select"))
            ? firstOption.text
            : "Select Option"

    select.innerHTML = ""
    const placeholder = document.createElement("option")
    placeholder.value = ""
    placeholder.text = placeholderText
    select.add(placeholder)

    options.forEach((opt) => {
        const option = document.createElement("option")
        option.value = opt
        option.text = formatLabel ? formatLabel(opt) : opt
        select.add(option)
    })

    select.setAttribute("data-populated", "true")
}

// --- HELPER: Compute totals from given state ---
function computeTotals(store: any) {
    let subtotal = 0
    const groups: Record<string, { count: number; price: number }> = {}

    const pricingData = store.pricingData || []
    const date = store.date || ""
    const travellers = store.travellers || []

    travellers.forEach((t: any) => {
        if (t.sharing && date) {
            const match = pricingData.find(
                (d: any) =>
                    d.start_date === date &&
                    d.variant_name === t.sharing
            )
            if (match) {
                if (!groups[t.sharing]) {
                    groups[t.sharing] = { count: 0, price: match.price }
                }
                groups[t.sharing].count += 1
                subtotal += match.price
            }
        }
    })

    const breakdown = Object.entries(groups).map(([variant, data]) => ({
        label: `${data.count}x Guest (${variant})`,
        price: data.price * data.count,
        unit_price: data.price,
        count: data.count,
        variant,
    }))

    const tax = subtotal * TAX_RATE
    return { subtotal, tax, total: subtotal + tax, breakdown }
}

// =====================================================
// TRIP & DATE DATA OVERRIDES (Step 1)
// =====================================================

export function withTripIdSource(Component): ComponentType {
    return (props: any) => {
        const [store, setStore] = useStore()

        useEffect(() => {
            const id = props.text || (typeof props.children === "string" ? props.children : null)
            if (!id) return
            if (id === store.tripId && (store.pricingData || []).length > 0) return

            setStore({ tripId: id, loading: true })

            const cacheKey = `trip_cache_${id}`
            const cached = (window as any)[cacheKey]

            if (cached) {
                setStore({ pricingData: cached, loading: false })
                return
            }

            fetch(
                `${SUPABASE_URL}/rest/v1/trip_pricing?trip_id=eq.${id}&select=*`,
                {
                    headers: {
                        apikey: SUPABASE_KEY,
                        Authorization: `Bearer ${SUPABASE_KEY}`,
                    },
                }
            )
                .then((res) => res.json())
                .then((data) => {
                    const today = new Date()
                    today.setHours(0, 0, 0, 0)
                    const validRows = (Array.isArray(data) ? data : []).filter(
                        (row: any) => new Date(row.start_date) >= today
                    )
                        ; (window as any)[cacheKey] = validRows
                    setStore({ pricingData: validRows, loading: false })
                })
                .catch((e) => {
                    console.error("[BookingLogic] Fetch Error:", e)
                    setStore({ loading: false })
                })
        }, [props.text, props.children])

        return (
            <Component
                {...props}
                style={{
                    ...(props.style || {}),
                    opacity: 0,
                    pointerEvents: "none",
                    position: "absolute",
                }}
            />
        )
    }
}

export function withDateSelect(Component): ComponentType {
    return (props: any) => {
        const [store, setStore] = useStore()

        useEffect(() => {
            const select = document.querySelector('select[name="departure_date"]') as HTMLSelectElement
            if (!select) return

            const pricingData = store.pricingData || []
            if (pricingData.length > 0 && select.getAttribute("data-populated") !== "true") {
                const uniqueDates = Array.from(new Set(pricingData.map((d: any) => d.start_date))).sort() as string[]
                populateDropdown(select, uniqueDates)

                select.addEventListener("change", () => {
                    setStore({ date: select.value })
                })

                // Auto-select first date if none selected
                if (!store.date && uniqueDates.length > 0) {
                    select.value = uniqueDates[0]
                    setStore({ date: uniqueDates[0] })
                }
            }
        }, [store.pricingData])

        return <Component {...props} />
    }
}

// =====================================================
// TRAVELLER REPEATER OVERRIDES (Step 2)
// =====================================================

// withTravellerList: The core "Repeater" override.
// Apply to the parent frame that holds the traveller row component.
export function withTravellerList(Component): ComponentType {
    return (props: any) => {
        const [store] = useStore()
        if (store.step !== 2) return <Component {...props} style={{ ...props.style, display: "none" }} />

        const travellers = store.travellers || []
        return (
            <Component {...props} style={{ ...props.style, height: "auto", overflow: "visible" }}>
                {travellers.map((_: any, index: number) => (
                    <TravellerContext.Provider key={index} value={index}>
                        {React.Children.map(props.children, (child) =>
                            React.cloneElement(child, { key: `${index}-${child.key || index}` })
                        )}
                    </TravellerContext.Provider>
                ))}
            </Component>
        )
    }
}

// withTravellerName: Binds a text input to the traveller's name.
export function withTravellerName(Component): ComponentType {
    return (props: any) => {
        const [store, setStore] = useStore()
        const index = useContext(TravellerContext)
        if (index === null) return <Component {...props} />

        const traveller = (store.travellers || [])[index] || {}
        const handleChange = (value: string) => {
            const list = [...(store.travellers || [])]
            if (list[index]) {
                list[index] = { ...list[index], name: value }
                setStore({ travellers: list })
            }
        }

        return (
            <Component
                {...props}
                value={traveller.name || ""}
                onValueChange={handleChange}
                onChange={(e: any) => handleChange(e.target.value)}
                placeholder="Guest Name"
            />
        )
    }
}

// withTravellerSharingKey: Binds a select dropdown to the traveller's sharing variant.
export function withTravellerSharingKey(Component): ComponentType {
    return (props: any) => {
        const [store, setStore] = useStore()
        const index = useContext(TravellerContext)
        const wrapperRef = useRef<HTMLDivElement>(null)

        const options = useMemo(() => {
            if (!store.date) return []
            const pd = store.pricingData || []
            return [...new Set(pd.filter((d: any) => d.start_date === store.date).map((d: any) => d.variant_name))].sort()
        }, [store.date, store.pricingData])

        if (index === null) return <Component {...props} />

        const traveller = (store.travellers || [])[index] || {}

        const handleChange = (val: string) => {
            const list = [...(store.travellers || [])]
            if (list[index]) {
                list[index] = { ...list[index], sharing: val }
                setStore({ travellers: list })
            }
        }

        useEffect(() => {
            if (!wrapperRef.current || options.length === 0) return
            const select = wrapperRef.current.querySelector("select") as HTMLSelectElement
            if (select && select.getAttribute("data-populated") !== "true") {
                populateDropdown(select, options, (s) => s.charAt(0).toUpperCase() + s.slice(1))
                select.value = traveller.sharing || ""

                const listener = () => handleChange(select.value)
                select.addEventListener("change", listener)
                return () => select.removeEventListener("change", listener)
            }
        }, [index, options])

        return (
            <div ref={wrapperRef} style={{ display: "contents" }}>
                <Component {...props} value={traveller.sharing || ""} />
            </div>
        )
    }
}

// withRemoveTraveller: Removes the current traveller from the list.
export function withRemoveTraveller(Component): ComponentType {
    return (props: any) => {
        const [store, setStore] = useStore()
        const index = useContext(TravellerContext)

        if (index === null || index === 0) {
            // Don't show remove button for the first guest
            return <Component {...props} style={{ ...props.style, opacity: 0, pointerEvents: "none" }} />
        }

        return (
            <Component
                {...props}
                onClick={() => {
                    const list = [...(store.travellers || [])]
                    list.splice(index, 1)
                    setStore({ travellers: list })
                }}
            />
        )
    }
}

// withAddTraveller: Adds a new guest to the list.
export function withAddTraveller(Component): ComponentType {
    return (props: any) => {
        const [store, setStore] = useStore()
        if (store.step !== 2) return <Component {...props} style={{ ...props.style, display: "none" }} />

        return (
            <Component
                {...props}
                onClick={() => {
                    const list = [...(store.travellers || []), { id: Date.now(), name: "", sharing: "" }]
                    setStore({ travellers: list })
                }}
            />
        )
    }
}

// =====================================================
// PRICING & SUMMARY OVERRIDES (Step 3)
// =====================================================

export function withPricingBreakdown(Component): ComponentType {
    return (props: any) => {
        const [store] = useStore()
        const { breakdown } = computeTotals(store)
        if (breakdown.length === 0) return null

        return (
            <div style={{ ...(props.style || {}), display: "flex", flexDirection: "column", gap: "8px", height: "auto" }}>
                {breakdown.map((item: any, i: number) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", color: "rgb(51, 51, 51)" }}>
                        <span>{item.label}</span>
                        <span>₹{item.price.toLocaleString()}</span>
                    </div>
                ))}
            </div>
        )
    }
}

export function withTaxDisplay(Component): ComponentType {
    return (props: any) => {
        const [store] = useStore()
        const { tax } = computeTotals(store)
        return <Component {...props} text={`Tax: ₹${tax.toLocaleString()}`} />
    }
}

export function withTotalDisplay(Component): ComponentType {
    return (props: any) => {
        const [store] = useStore()
        const { total } = computeTotals(store)
        return <Component {...props} text={`₹${total.toLocaleString()}`} />
    }
}

export function withSelectedDateText(Component): ComponentType {
    return (props: any) => {
        const [store] = useStore()
        const txt = store.date ? new Date(store.date).toDateString() : "-"
        return <Component {...props} text={`Departure: ${txt}`} />
    }
}

// =====================================================
// STRUCTURAL & VISIBILITY OVERRIDES
// =====================================================

export function withPaymentSection(Component): ComponentType {
    return (props: any) => <Component {...props} />
}

export function withVariantSection(Component): ComponentType {
    return (props: any) => <Component {...props} />
}

export function withTravellerSection(Component): ComponentType {
    return (props: any) => <Component {...props} />
}

export function withButtonRow(Component): ComponentType {
    return (props: any) => (
        <Component
            {...props}
            style={{
                ...(props.style || {}),
                display: "flex",
                flexDirection: "row",
                gap: "12px",
                width: "100%",
            }}
        />
    )
}

// =====================================================
// ACTION & NAVIGATION OVERRIDES
// =====================================================

export function withPayButton(Component): ComponentType {
    return (props: any) => {
        const [store] = useStore()
        const { total, breakdown, tax } = computeTotals(store)
        const [submitting, setSubmitting] = React.useState(false)

        const travellers = store.travellers || []
        const isValid =
            store.date &&
            store.contactName &&
            store.contactEmail &&
            total > 0 &&
            travellers.every((t: any) => t.name && t.sharing)

        const handlePay = async () => {
            if (!isValid || submitting) return
            setSubmitting(true)

            const payload = {
                trip_id: store.tripId,
                departure_date: store.date,
                travellers: travellers.map((t: any) => ({
                    name: t.name,
                    sharing: t.sharing,
                })),
                payment_breakdown: breakdown,
                tax_amount: tax,
                total_amount: total,
                currency: "INR",
                name: store.contactName,
                email: store.contactEmail,
                phone: store.contactPhone,
                created_at: new Date().toISOString(),
            }

            console.log("[Booking] Initiating payment setup...", payload)

            try {
                const res = await fetch(`${SUPABASE_URL}/functions/v1/create-booking`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        apikey: SUPABASE_KEY,
                        Authorization: `Bearer ${SUPABASE_KEY}`,
                    },
                    body: JSON.stringify(payload),
                })

                console.log("[Booking] Edge Function Status:", res.status)

                if (!res.ok) {
                    const errorText = await res.text()
                    console.error("[Booking] Edge Function Error Response:", errorText)
                    showInlineError(`Setup Failed (Status ${res.status}). Check console for details.`)
                    setSubmitting(false)
                    return
                }

                const data = await res.json()
                console.log("[Booking] Edge Function Data Received:", data)

                // The Edge Function returns the full PayU form data in the 'payu' property.
                // The destination URL is specifically in 'payu.action'.
                const payuData = data.payu
                if (!payuData || !payuData.action) {
                    console.error("[Booking] Missing 'payu' object or 'payu.action' in response.", data)
                    showInlineError("Payment setup failed. Response structure missing 'payu.action'.")
                    setSubmitting(false)
                    return
                }

                const targetUrl = payuData.action
                console.log("[Booking] Redirecting to PayU gateway:", targetUrl)

                const form = document.createElement("form")
                form.method = "POST"
                form.action = targetUrl

                // Add all PayU parameters as hidden inputs
                Object.entries(payuData).forEach(([key, value]) => {
                    if (key === "action") return // Skip the URL itself
                    const input = document.createElement("input")
                    input.type = "hidden"
                    input.name = key
                    input.value = String(value)
                    form.appendChild(input)
                })

                document.body.appendChild(form)
                form.submit()
            } catch (err) {
                console.error("[Booking] Network/Execution Error:", err)
                showInlineError("Network error. Please try again.")
                setSubmitting(false)
            }
        }

        const blockEvent = (e: any) => {
            e.stopPropagation()
            e.preventDefault()
            if (!submitting) showInlineError("Please fill in all details before paying.")
        }

        const isLocked = !isValid || submitting

        return (
            <div style={{ position: "relative", width: "100%" }}>
                <Component
                    {...props}
                    onClick={handlePay}
                    style={{
                        ...(props.style || {}),
                        width: "100%",
                        opacity: isLocked ? 0.5 : 1,
                        cursor: isLocked ? "not-allowed" : "pointer",
                    }}
                />
                {isLocked && (
                    <div
                        onClick={blockEvent}
                        style={{
                            position: "absolute",
                            inset: 0,
                            zIndex: 10,
                            cursor: submitting ? "wait" : "not-allowed",
                        }}
                    />
                )}
            </div>
        )
    }
}

// --- Validation helpers ---
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_REGEX = /^\+?[\d\s\-()]{10,15}$/

function validateStep1(store: any): string[] {
    const errors: string[] = []
    if (!store.date) errors.push("Departure date is required")
    if (!store.contactName?.trim()) errors.push("Your name is required")
    if (!store.contactPhone?.trim()) errors.push("Phone number is required")
    else if (!PHONE_REGEX.test(store.contactPhone.trim())) errors.push("Phone number is invalid")
    if (!store.contactEmail?.trim()) errors.push("Email address is required")
    else if (!EMAIL_REGEX.test(store.contactEmail.trim())) errors.push("Email address is invalid")
    return errors
}

function validateStep2(travellers: any[]): string[] {
    const errors: string[] = []
    for (let i = 0; i < travellers.length; i++) {
        const t = travellers[i]
        if (!t.name?.trim()) errors.push(`Name required for Traveller ${i + 1}`)
        if (!t.sharing) errors.push(`Sharing required for Traveller ${i + 1}`)
    }
    return errors
}

function showInlineError(errors: string | string[]) {
    const existing = document.getElementById("__booking_error_toast")
    if (existing) existing.remove()

    const messages = Array.isArray(errors) ? errors : [errors]
    const toast = document.createElement("div")
    toast.id = "__booking_error_toast"

    toast.innerHTML = `
        <div style="font-weight:700; margin-bottom: ${messages.length > 1 ? '8px' : '0'}; display: flex; align-items: center; gap: 8px;">
            ⚠️ ${messages.length === 1 ? messages[0] : 'Please complete:'}
        </div>
        ${messages.length > 1 ? '<div style="opacity:0.9; font-size:13px; padding-left:24px;">' + messages.map(m => `• ${m}`).join('<br>') + '</div>' : ''}
    `

    Object.assign(toast.style, {
        position: "fixed",
        top: "20px",
        left: "50%",
        transform: "translateX(-50%)",
        background: "rgba(30, 30, 50, 0.95)",
        color: "#fff",
        padding: "14px 22px",
        borderRadius: "12px",
        fontSize: "14px",
        fontFamily: "Manrope, sans-serif",
        zIndex: "99999",
        boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
        backdropFilter: "blur(10px)",
        maxWidth: "90vw",
        width: "max-content",
        animation: "fadeInDown 0.3s ease",
    })

    if (!document.getElementById("__booking_toast_styles")) {
        const style = document.createElement("style")
        style.id = "__booking_toast_styles"
        style.textContent = `
            @keyframes fadeInDown { from { opacity:0; transform:translateX(-50%) translateY(-10px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }
            @keyframes fadeOutUp { from { opacity:1; transform:translateX(-50%) translateY(0); } to { opacity:0; transform:translateX(-50%) translateY(-10px); } }
        `
        document.head.appendChild(style)
    }

    document.body.appendChild(toast)
    setTimeout(() => {
        toast.style.animation = "fadeOutUp 0.3s ease"
        setTimeout(() => toast.remove(), 300)
    }, 3500)
}

export function withNextButton(Component): ComponentType {
    return (props: any) => {
        const [store, setStore] = useStore()
        const errors = validateStep1(store)
        const isValid = errors.length === 0

        const handleClick = () => {
            if (!isValid) return
            const travellers = [...(store.travellers || [])]
            if (travellers.length > 0) travellers[0] = { ...travellers[0], name: store.contactName.trim() }
            setStore({ step: 2, travellers })
        }

        const blockEvent = (e: any) => {
            e.stopPropagation()
            e.preventDefault()
            showInlineError(errors)
        }

        return (
            <div style={{ position: "relative", width: "100%" }}>
                <Component
                    {...props}
                    text={"Next"}
                    onClick={handleClick}
                    style={{ ...(props.style || {}), width: "100%", opacity: isValid ? 1 : 0.7 }}
                />
                {!isValid && <div onClick={blockEvent} style={{ position: "absolute", inset: 0, zIndex: 10 }} />}
            </div>
        )
    }
}

export function withReviewButton(Component): ComponentType {
    return (props: any) => {
        const [store, setStore] = useStore()
        const errors = validateStep2(store.travellers || [])
        const isValid = errors.length === 0

        const handleClick = () => {
            if (!isValid) return
            setStore({ step: 3 })
        }

        const blockEvent = (e: any) => {
            e.stopPropagation()
            e.preventDefault()
            showInlineError(errors)
        }

        return (
            <div style={{ position: "relative", width: "100%" }}>
                <Component
                    {...props}
                    text={"Review"}
                    onClick={handleClick}
                    style={{ ...(props.style || {}), width: "100%", opacity: isValid ? 1 : 0.7 }}
                />
                {!isValid && <div onClick={blockEvent} style={{ position: "absolute", inset: 0, zIndex: 10 }} />}
            </div>
        )
    }
}

export function withPreviousButton(Component): ComponentType {
    return (props: any) => {
        const [store, setStore] = useStore()
        const handleClick = () => setStore({ step: Math.max(1, store.step - 1) })
        return <Component {...props} onClick={handleClick} style={{ ...(props.style || {}), width: "100%" }} />
    }
}

// --- CONTACT INFO OVERRIDES ---

export function withContactNameInput(Component): ComponentType {
    return (props: any) => {
        const [store, setStore] = useStore()
        const handleChange = (v: string) => setStore({ contactName: v })
        return <Component {...props} value={store.contactName} onValueChange={handleChange} onChange={(e: any) => handleChange(e.target.value)} />
    }
}

export function withContactPhoneInput(Component): ComponentType {
    return (props: any) => {
        const [store, setStore] = useStore()
        const handleChange = (v: string) => setStore({ contactPhone: v.replace(/[^\d\s\+\-()]/g, "") })
        return <Component {...props} value={store.contactPhone} onValueChange={handleChange} onChange={(e: any) => handleChange(e.target.value)} />
    }
}

export function withContactEmailInput(Component): ComponentType {
    return (props: any) => {
        const [store, setStore] = useStore()
        const handleChange = (v: string) => setStore({ contactEmail: v })
        return <Component {...props} value={store.contactEmail} onValueChange={handleChange} onChange={(e: any) => handleChange(e.target.value)} />
    }
}
