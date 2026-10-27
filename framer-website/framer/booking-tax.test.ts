import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts"
import { buildWebsiteBillingSnapshot, calculateWebsiteBookingTotals, selectWebsiteDiscount } from "./booking-tax.ts"

Deno.test("TWN checkout billing snapshot reconciles GST, coupon discount, and booking total", () => {
    const totals = calculateWebsiteBookingTotals({
        issuer: "TWN",
        taxableAmount: 1000,
        discountAmount: 200,
    })

    assertEquals(totals, {
        issuer: "TWN",
        taxableAmount: 1000,
        discountAmount: 200,
        gstAmount: 50,
        tcsBasis: 0,
        tcsAmount: 0,
        taxAmount: 50,
        totalAmount: 850,
        taxLabel: "GST",
    })
    assertEquals(buildWebsiteBillingSnapshot({ ...totals, currency: "INR" }), {
        version: 1,
        issuer: "TWN",
        isGstInvoice: true,
        currency: "INR",
        taxableAmountMinor: 100000,
        discountAmountMinor: 20000,
        gstAmountMinor: 5000,
        tcsBasisMinor: 0,
        tcsAmountMinor: 0,
        totalAmountMinor: 85000,
        taxPercent: 5,
        taxLabel: "GST",
    })
})

Deno.test("NTC checkout adds TCS on taxable amount plus GST before discount", () => {
    const totals = calculateWebsiteBookingTotals({
        issuer: "NTC",
        taxableAmount: 10000,
        discountAmount: 1000,
    })

    assertEquals(totals.gstAmount, 500)
    assertEquals(totals.tcsBasis, 10500)
    assertEquals(totals.tcsAmount, 210)
    assertEquals(totals.taxAmount, 710)
    assertEquals(totals.totalAmount, 9710)
})

Deno.test("billing rejects unsafe money and discounts larger than the catalogue subtotal", () => {
    assertThrows(() => calculateWebsiteBookingTotals({
        issuer: "TWN",
        taxableAmount: 1000,
        discountAmount: 1001,
    }), RangeError)
    assertThrows(() => calculateWebsiteBookingTotals({
        issuer: "TWN",
        taxableAmount: 1.001,
        discountAmount: 0,
    }), RangeError)
})

Deno.test("empty checkout state can render zero totals before traveller options are selected", () => {
    assertEquals(calculateWebsiteBookingTotals({
        issuer: "TWN",
        taxableAmount: 0,
        discountAmount: 0,
    }), {
        issuer: "TWN",
        taxableAmount: 0,
        discountAmount: 0,
        gstAmount: 0,
        tcsBasis: 0,
        tcsAmount: 0,
        taxAmount: 0,
        totalAmount: 0,
        taxLabel: "GST",
    })
})

Deno.test("checkout applies either the early-bird discount or the coupon, whichever saves more", () => {
    assertEquals(selectWebsiteDiscount({
        subtotal: 1000,
        earlyBirdDiscount: 150,
        couponDiscount: 100,
    }), {
        appliedDiscountSource: "early_bird",
        earlyBirdDiscountAmount: 150,
        couponDiscountAmount: 100,
        discountAmountTotal: 150,
    })
})
