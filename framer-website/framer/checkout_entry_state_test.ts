import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts"
import { getCheckoutEntryState } from "./checkout_entry_state.ts"

Deno.test("missing trip context blocks stale checkout data immediately", () => {
    assertEquals(getCheckoutEntryState({
        loading: true,
        pricingData: [{ id: "stale-trip-price" }],
    }), "missing-trip")
})

Deno.test("valid trip context remains in loading state until pricing resolves", () => {
    assertEquals(getCheckoutEntryState({
        loading: true,
        tripId: "trip-123",
    }), "loading")
})

Deno.test("trip context without available pricing cannot start checkout", () => {
    assertEquals(getCheckoutEntryState({
        loading: false,
        slug: "summer-spiti",
        pricingData: [],
    }), "unavailable")
    assertEquals(getCheckoutEntryState({
        loading: false,
        tripId: "trip-123",
        pricingUnavailable: true,
        pricingData: [{ departure_date: "2026-12-25" }],
    }), "unavailable")
})

Deno.test("trip with loaded pricing can show checkout", () => {
    assertEquals(getCheckoutEntryState({
        loading: false,
        tripId: "trip-123",
        pricingData: [{ departure_date: "2026-12-25" }],
    }), "ready")
})
