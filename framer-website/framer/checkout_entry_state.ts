export type CheckoutEntryStateInput = {
    loading: boolean
    tripId?: string | null
    slug?: string | null
    pricingUnavailable?: boolean
    pricingData?: unknown[] | null
}

export function getCheckoutEntryState(
    input: CheckoutEntryStateInput,
): "missing-trip" | "loading" | "unavailable" | "ready" {
    if (!String(input.tripId || "").trim() && !String(input.slug || "").trim()) {
        return "missing-trip"
    }
    if (input.loading) return "loading"
    if (input.pricingUnavailable || !input.pricingData?.length) {
        return "unavailable"
    }
    return "ready"
}
