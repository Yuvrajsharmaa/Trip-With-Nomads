import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts"
import { calculatePaymentAmounts } from "./payment_amounts.ts"

Deno.test("full payment uses the total and has no due amount", () => {
    assertEquals(
        calculatePaymentAmounts({ paymentMode: "full", totalAmount: 73498.95 }),
        { paymentMode: "full", payableNowAmount: 73498.95, dueAmount: 0 },
    )
})

Deno.test("partial payment uses 25 percent and exposes the remaining due", () => {
    assertEquals(
        calculatePaymentAmounts({ paymentMode: "partial_25", totalAmount: 1000 }),
        { paymentMode: "partial_25", payableNowAmount: 250, dueAmount: 750 },
    )
})

Deno.test("partial payment preserves the server-stored payable amount", () => {
    assertEquals(
        calculatePaymentAmounts({
            paymentMode: "partial_25",
            totalAmount: 1000,
            storedPayableNowAmount: 275,
        }),
        { paymentMode: "partial_25", payableNowAmount: 275, dueAmount: 725 },
    )
})
