import { ComponentType, useEffect } from "react"
import { supabase } from "./supabase.tsx"
import { store } from "./store.tsx"

// 1. Maintain a local copy of the form state in the Store
store.formData = {
    trip_id: "",
    departure_date: "",
    transport: "traveller", // Default
    sharing: "triple",      // Default
    amount: 0
}

// Cache to prevent spamming the API
let lastFetched = ""

// Helper to fetch price based on current store state
const updatePrice = async () => {
    // A. Robustly find ALL required fields in the DOM if we don't have them yet
    if (!store.formData.trip_id) {
        const el = document.querySelector('input[name="trip_id"]') as HTMLInputElement
        if (el && el.value) store.formData.trip_id = el.value
    }
    // Also check other fields because defaults might be wrong or empty
    const dateEl = (document.querySelector('select[name="departure_date"]') || document.querySelector('input[name="departure_date"]')) as HTMLInputElement
    if (dateEl && dateEl.value) store.formData.departure_date = dateEl.value

    const transportEl = (document.querySelector('select[name="transport"]') || document.querySelector('input[name="transport"]')) as HTMLInputElement
    if (transportEl && transportEl.value) store.formData.transport = transportEl.value

    const sharingEl = (document.querySelector('select[name="sharing"]') || document.querySelector('input[name="sharing"]')) as HTMLInputElement
    if (sharingEl && sharingEl.value) store.formData.sharing = sharingEl.value

    const { trip_id, departure_date, transport, sharing } = store.formData

    // B. Check against Cache
    const currentParams = JSON.stringify({ trip_id, departure_date, transport, sharing })
    if (currentParams === lastFetched) return

    // C. Validate fields
    if (!trip_id || !departure_date || !transport || !sharing) {
        // console.log("⏳ Missing fields:", { trip_id, departure_date, transport, sharing })
        return
    }

    // D. Fetch
    lastFetched = currentParams
    console.log("⚡ Fetching Price for:", { trip_id, departure_date, transport, sharing })

    const { data, error } = await supabase
        .from("trip_pricing")
        .select("price")
        .eq("trip_id", trip_id)
        .eq("departure_date", departure_date)
        .eq("transport", transport)
        .eq("sharing", sharing)
        .single()

    if (data) {
        console.log(`💰 Price Found (Store ${store.id}):`, data.price)
        store.price = "₹" + data.price.toLocaleString("en-IN")
        store.formData.amount = data.price

        // Notify the UI to update immediately (Event-Driven)
        window.dispatchEvent(new Event("PRICE_UPDATED"))
    } else {
        lastFetched = "" // Retry if failed
        console.log("❌ Price not found")
    }
}

export function PriceCalculator(Component: ComponentType): ComponentType {
    return (props: any) => {
        useEffect(() => {
            // 1. Polling Strategy: Check multiple times to catch Framer's DOM render
            // This ensures the price loads automatically without needing to click "Next"
            // We check at 0.5s, 1s, 2s, 3s to guarantee we find the hidden inputs
            const timers = [500, 1000, 2000, 3000].map(t => setTimeout(updatePrice, t))

            // 2. Event Listener: Listen for changes on ANY Select or Input in this container
            const handleChange = (e: any) => {
                const { name, value } = e.target
                if (name && name in store.formData) {
                    store.formData[name] = value
                    lastFetched = "" // Reset cache to force update
                    updatePrice()
                }
            }

            // Attach listener to the form element
            const form = document.querySelector("form")
            if (form) {
                form.addEventListener("change", handleChange)
                form.addEventListener("input", handleChange)
            }

            return () => {
                timers.forEach(clearTimeout)
                if (form) {
                    form.removeEventListener("change", handleChange)
                    form.removeEventListener("input", handleChange)
                }
            }
        }, [])

        return <Component {...props} />
    }
}
