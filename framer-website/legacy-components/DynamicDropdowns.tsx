import { ComponentType, useEffect } from "react"
import { supabase } from "./supabase.tsx"

export function DynamicDropdowns(Component: ComponentType): ComponentType {
    return (props: any) => {
        useEffect(() => {
            // Internal state to hold all pricing rows
            let allPricingData: any[] = []
            let isFetching = false
            // Cache check per instance to avoid duplicates if re-mounted rapidly
            const instanceId = Math.random().toString(36).substr(2, 5)

            const fetchDates = async () => {
                // 1. Find the Trip ID
                let tripId = props.trip_id
                if (!tripId) {
                    const input = document.querySelector('input[name="trip_id"]') as HTMLInputElement
                    if (input) tripId = input.value
                }

                if (!tripId) return

                // Avoid duplicate fetches
                // We check a global window object or similar if we want truly global caching across component re-renders
                // But for now, let's just trust the local variable 'allPricingData' if it's populated.
                // However, since this is a functional component, we should attach to window for persistence against re-mounts if Framer does that.
                const cacheKey = `trip_cache_${tripId}`
                const cached = (window as any)[cacheKey]

                if (cached) {
                    if (allPricingData.length === 0) {
                        allPricingData = cached
                        // console.log(`[${instanceId}] ⚡ Using cached data for ${tripId}`)
                        initializeDropdowns()
                    } else {
                        // Data already loaded locally, just ensure DOM is up to date
                        // But DO NOT log to avoid spam
                        initializeDropdowns()
                    }
                    return
                }

                if (isFetching) return
                isFetching = true

                console.log(`[${instanceId}] ⚡ Fetching fresh data for Trip:`, tripId)

                // 2. Fetch from Supabase
                const { data, error } = await supabase
                    .from("trip_pricing")
                    .select("departure_date, transport, sharing, price")
                    .eq("trip_id", tripId)

                isFetching = false

                if (error) {
                    console.error("❌ Failed to fetch options:", error)
                    return
                }

                if (data) {
                    // Filter Past Dates FIRST
                    const today = new Date()
                    today.setHours(0, 0, 0, 0)

                    const validRows = data.filter(row => {
                        const rowDate = new Date(row.departure_date)
                        return rowDate >= today
                    })

                    if (validRows.length === 0) {
                        // Only log this ONCE per fetch, not loop
                        if (!window['has_logged_empty_' + tripId]) {
                            console.warn("⚠️ No future dates found! (Past dates hidden)")
                            window['has_logged_empty_' + tripId] = true
                        }
                    }

                    allPricingData = validRows
                        // Cache it
                        ; (window as any)[cacheKey] = validRows

                    initializeDropdowns()
                }
            }


            const initializeDropdowns = () => {
                // Initial Population: Dates only
                const uniqueDates = Array.from(new Set(allPricingData.map(d => d.departure_date))).sort()

                // Populate Date Dropdown
                populateDropdown('departure_date', uniqueDates)

                // ---------------------------------------------------------
                // UX OPTIMIZATION: Auto-Select Lowest Variant
                // ---------------------------------------------------------
                if (uniqueDates.length > 0) {
                    const firstDate = uniqueDates[0]
                    const dateSelect = document.querySelector('select[name="departure_date"]') as HTMLSelectElement
                    if (dateSelect) {
                        dateSelect.value = firstDate

                        // Find lowest price for this date to determine default transport
                        const relevantRows = allPricingData.filter(d => d.departure_date === firstDate)

                        // Sort by price ascending
                        relevantRows.sort((a, b) => (a.price || 0) - (b.price || 0))

                        // We can't set Transport/Sharing directly here easily because the listeners handle population.
                        // But we can hint the listeners or just let the listeners pick the first one (which might not be sorted by price).
                        // Actually, my listener logic:
                        // "const uniqueTransports = Array.from(new Set(relevantRows.map(d => d.transport))).sort()"
                        // This sorts ALPHABETICALLY. 

                        // Strategy: We won't change the dropdown sort order (alphabetical is good for UX finding items),
                        // but we want to SELECT the cheap one.

                        // We need to pass the "preferred default" to the listener or Pre-set it?
                        // The listener logic has: "if (uniqueTransports.length > 0) transSelect.value = uniqueTransports[0]"

                        // Let's modify the listener to be smarter? 
                        // Or simpler: In setupListeners, when picking a default, look at the prices.

                        setupListeners(true)
                    }
                } else {
                    setupListeners(false)
                }
            }

            const setupListeners = (autoSelect = false) => {
                const dateSelect = document.querySelector('select[name="departure_date"]') as HTMLSelectElement
                const transSelect = document.querySelector('select[name="transport"]') as HTMLSelectElement
                const shareSelect = document.querySelector('select[name="sharing"]') as HTMLSelectElement

                if (!dateSelect) return

                // CRITICAL FIX: Only run setupListeners if NOT already attached
                if (dateSelect.getAttribute("data-listeners-attached") === "true") {
                    // Do NOT forcefully dispatch 'change' here indiscriminately.
                    // The logic below caused the infinite loop:
                    /*
                    if (autoSelect && dateSelect.value) {
                        dateSelect.dispatchEvent(new Event('change'))
                    }
                    */
                    // If we need to ensure downstream is populated, check if downstream IS empty?
                    // But dispatching change causes PriceCalculator to update DOM -> MutationObserver -> Loops.
                    // We trust that if listeners are attached, the user or the initial run handled it.
                    return
                }

                const updateDownstream = (trigger: 'date' | 'transport') => {
                    const selectedDate = dateSelect.value

                    if (trigger === 'date') {
                        // Preserve selection if possible
                        const currentTransport = transSelect ? transSelect.value : ""

                        if (transSelect) {
                            // Only clear if actually changing options? 
                            // Optimized: clear and repopulate
                            transSelect.innerHTML = ""
                            const ph = document.createElement("option"); ph.value = ""; ph.text = "Select Transport"; transSelect.add(ph)
                        }

                        if (!selectedDate) return

                        const relevantRows = allPricingData.filter(d => d.departure_date === selectedDate)
                        const uniqueTransports = Array.from(new Set(relevantRows.map(d => d.transport))).sort()
                        populateDropdown('transport', uniqueTransports)

                        // CASADING RESELECTION LOGIC
                        if (transSelect) {
                            if (uniqueTransports.includes(currentTransport)) {
                                transSelect.value = currentTransport
                            } else if (uniqueTransports.length > 0) {
                                // Pick cheapest transport for this date
                                const sortedRows = [...relevantRows].sort((a, b) => (a.price || 0) - (b.price || 0))
                                const cheapestTransport = sortedRows.length > 0 ? sortedRows[0].transport : uniqueTransports[0]

                                if (uniqueTransports.includes(cheapestTransport)) {
                                    transSelect.value = cheapestTransport
                                } else {
                                    transSelect.value = uniqueTransports[0]
                                }
                            }
                            // Trigger next level
                            updateDownstream('transport')
                        }
                    }

                    if (trigger === 'transport') {
                        const currentSharing = shareSelect ? shareSelect.value : ""
                        const selectedTrans = transSelect ? transSelect.value : ""

                        if (shareSelect) {
                            shareSelect.innerHTML = ""
                            const ph = document.createElement("option"); ph.value = ""; ph.text = "Select Sharing"; shareSelect.add(ph)
                        }

                        if (!selectedDate || !selectedTrans) return

                        const relevantRows = allPricingData.filter(d =>
                            d.departure_date === selectedDate &&
                            d.transport === selectedTrans
                        )
                        const uniqueSharings = Array.from(new Set(relevantRows.map(d => d.sharing))).sort()
                        populateDropdown('sharing', uniqueSharings)

                        // CASADING RESELECTION LOGIC
                        if (shareSelect) {
                            if (uniqueSharings.includes(currentSharing)) {
                                shareSelect.value = currentSharing
                            } else if (uniqueSharings.length > 0) {
                                // Pick cheapest sharing
                                const sortedRows = [...relevantRows].sort((a, b) => (a.price || 0) - (b.price || 0))
                                const cheapestSharing = sortedRows.length > 0 ? sortedRows[0].sharing : uniqueSharings[0]

                                if (uniqueSharings.includes(cheapestSharing)) {
                                    shareSelect.value = cheapestSharing
                                } else {
                                    shareSelect.value = uniqueSharings[0]
                                }
                            }
                            // Only dispatch change if value CHANGED or if it's the chain reaction
                            // We avoid dispatching bubbles=true if we can avoid it to stop loops, 
                            // but PriceCalculator needs to know.
                            shareSelect.dispatchEvent(new Event('change', { bubbles: true }))
                            shareSelect.dispatchEvent(new Event('input', { bubbles: true }))
                        }
                    }
                }

                // Handler for Date Change
                const onDateChange = () => updateDownstream('date')
                const onTransportChange = () => updateDownstream('transport')

                // Attach
                dateSelect.addEventListener('change', onDateChange)
                if (transSelect) transSelect.addEventListener('change', onTransportChange)

                // Mark as attached
                dateSelect.setAttribute("data-listeners-attached", "true")

                // Trigger once if needed
                if (autoSelect && dateSelect.value) {
                    onDateChange()
                }
            }

            const populateDropdown = (name: string, options: string[]) => {
                const select = document.querySelector(`select[name="${name}"]`) as HTMLSelectElement

                if (!select) return

                // Check if already populated with same options to avoid DOM churn?
                // This is hard without comparing all options.
                // But we can check a checksum or length.

                // Preserve placeholder
                const firstOption = select.options[0]
                const placeholderText = (firstOption && (firstOption.value === "" || firstOption.text.toLowerCase().includes("select")))
                    ? firstOption.text
                    : `Select ${name}`

                select.innerHTML = ""

                // Always add placeholder
                const placeholder = document.createElement("option")
                placeholder.value = ""
                placeholder.text = placeholderText
                select.add(placeholder)

                options.forEach(opt => {
                    const option = document.createElement("option")
                    option.value = opt
                    option.text = opt.charAt(0).toUpperCase() + opt.slice(1) // Capitalize
                    select.add(option)
                })

                select.setAttribute("data-populated", "true")
            }

            // Polling Strategy: Run multiple times BUT check global cache
            const timers = [100, 500, 1000, 2500].map(t => setTimeout(fetchDates, t))

            // Observer Strategy: Check if DOM elements appear
            // This needs to be throttled or guarded
            let debounceTimer: any
            const observer = new MutationObserver((mutations) => {
                // Ignore mutations if we are already fetching or strictly cached/initialized
                // If we have data and listeners attached, we probably don't need to do anything 
                // UNLESS the dropdowns were removed from DOM and re-added.
                const dateSelect = document.querySelector('select[name="departure_date"]')
                if (dateSelect && dateSelect.getAttribute("data-listeners-attached") === "true") {
                    return; // Already setup, ignore DOM noise
                }

                clearTimeout(debounceTimer)
                debounceTimer = setTimeout(() => {
                    fetchDates()
                }, 200) // Debounce 200ms
            })

            observer.observe(document.body, { childList: true, subtree: true })


            return () => {
                timers.forEach(clearTimeout)
                observer.disconnect()
                // Cleanup listeners? Not critical for simple pages but good practice
                // implementation omitted for brevity as we didn't store refs to the exact functions
            }
        }, [])

        return <Component {...props} />
    }
}
