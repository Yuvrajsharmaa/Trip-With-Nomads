import {
    calculateSettlementStatus,
    isAmountMatch,
    transitionPaymentStatus,
} from "./payment_reconciliation.ts"
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts"

Deno.test("payment transitions are monotonic", () => {
    assertEquals(transitionPaymentStatus("pending", "success"), "paid")
    assertEquals(transitionPaymentStatus("failed", "success"), "paid")
    assertEquals(transitionPaymentStatus("paid", "failure"), "paid")
    assertEquals(transitionPaymentStatus("paid", "success"), "paid")
    assertEquals(transitionPaymentStatus("pending", "failure"), "failed")
})

Deno.test("settlement status distinguishes full and 25 percent payments", () => {
    assertEquals(calculateSettlementStatus("partial_25", 10000, 2500), "partially_paid")
    assertEquals(calculateSettlementStatus("full", 10000, 10000), "fully_paid")
    assertEquals(calculateSettlementStatus("full", 10000, 2500), "partially_paid")
})

Deno.test("payment amount matching uses minor units and a small gateway tolerance", () => {
    assertEquals(isAmountMatch(2500, 2500), true)
    assertEquals(isAmountMatch(2501, 2500, 1), true)
    assertEquals(isAmountMatch(2550, 2500, 1), false)
})
