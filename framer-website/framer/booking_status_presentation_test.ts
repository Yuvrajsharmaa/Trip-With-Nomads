import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts"

const source = await Deno.readTextFile(new URL("./BookingStatusOverride.tsx", import.meta.url))

Deno.test("booking status copy starts with a neutral verified-loading state", () => {
    assert(source.includes('function statusTextForState('), "status text state mapper is missing")
    assert(source.includes('if (state === "loading") return options.loadingText'), "loading is not handled explicitly")
    assert(source.includes('"Checking payment status…"'), "loading copy is not reassuring and neutral")
    assert(source.includes('"We couldn\'t verify this booking."'), "error copy is not generic")
    assert(source.includes('statusTextForState(state, {'), "visible copy does not use the state mapper")
})

Deno.test("unverified booking state cannot show a success icon", () => {
    assert(source.includes('function statusIconForState('), "status icon state mapper is missing")
    assert(source.includes('if (state === "loading") return "checking"'), "loading can show a payment icon")
    assert(source.includes('if (state === "error") return "unavailable"'), "errors can show a payment icon")
    assert(source.includes('statusIconForState(state, data?.payment_status)'), "icon does not use verified state")
    assert(source.includes('iconState === "success"'), "verified paid success icon is missing")
})

Deno.test("payment summary stays hidden until verification and hides failures", () => {
    assert(source.includes('function shouldShowPaymentSummary('), "summary visibility mapper is missing")
    assert(source.includes('return state === "ready" && paymentStatus !== "failed"'), "summary can appear before verification")
    assert(source.includes('shouldShowPaymentSummary(state, data?.payment_status)'), "summary visibility does not use verified state")
    assert(!source.includes('from "./booking_status_presentation.ts"'))
})
