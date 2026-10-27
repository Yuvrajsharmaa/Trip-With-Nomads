export type WebsiteFinanceIssuer = "TWN" | "NTC"

export type WebsiteBookingTotals = {
    issuer: WebsiteFinanceIssuer
    taxableAmount: number
    discountAmount: number
    gstAmount: number
    tcsBasis: number
    tcsAmount: number
    taxAmount: number
    totalAmount: number
    taxLabel: string
}

export function selectWebsiteDiscount(input: {
    subtotal: number
    earlyBirdDiscount: number
    couponDiscount: number
}) {
    const subtotal = Math.max(0, Math.round(input.subtotal * 100) / 100)
    const earlyBirdDiscountAmount = Math.max(0, Math.min(subtotal, Math.round(input.earlyBirdDiscount * 100) / 100))
    const couponDiscountAmount = Math.max(0, Math.min(subtotal, Math.round(input.couponDiscount * 100) / 100))
    const appliedDiscountSource = couponDiscountAmount > earlyBirdDiscountAmount
        ? "coupon"
        : earlyBirdDiscountAmount > 0
        ? "early_bird"
        : couponDiscountAmount > 0
        ? "coupon"
        : "none"

    return {
        appliedDiscountSource: appliedDiscountSource as "none" | "early_bird" | "coupon",
        earlyBirdDiscountAmount,
        couponDiscountAmount,
        discountAmountTotal: appliedDiscountSource === "coupon"
            ? couponDiscountAmount
            : appliedDiscountSource === "early_bird"
            ? earlyBirdDiscountAmount
            : 0,
    }
}

function toMinor(value: number, name: string): number {
    const minor = Math.round(value * 100)
    if (!Number.isFinite(value) || !Number.isSafeInteger(minor) || Math.abs(value * 100 - minor) > 0.000001) {
        throw new RangeError(`${name} must be a safe amount with at most two decimal places`)
    }
    return minor
}

function toRupees(valueMinor: number): number {
    return valueMinor / 100
}

function percentageMinor(amountMinor: number, basisPoints: number): number {
    const wholeRateUnits = Math.floor(amountMinor / 10_000) * basisPoints
    const remainderRateUnits = amountMinor % 10_000
    const roundedRemainder = Math.floor((remainderRateUnits * basisPoints + 5_000) / 10_000)
    const amountMinorResult = wholeRateUnits + roundedRemainder
    if (!Number.isSafeInteger(amountMinorResult) || amountMinorResult < 0) {
        throw new RangeError("Calculated tax exceeds the supported amount")
    }
    return amountMinorResult
}

export function calculateWebsiteBookingTotals(input: {
    issuer: WebsiteFinanceIssuer
    taxableAmount: number
    discountAmount: number
}): WebsiteBookingTotals {
    if (input.issuer !== "TWN" && input.issuer !== "NTC") {
        throw new RangeError("A TWN or NTC billing issuer is required")
    }
    const taxableAmountMinor = toMinor(input.taxableAmount, "Taxable amount")
    const discountAmountMinor = toMinor(input.discountAmount, "Discount amount")
    if (taxableAmountMinor < 0 || discountAmountMinor < 0 || discountAmountMinor > taxableAmountMinor) {
        throw new RangeError("Discount must be between zero and the taxable amount")
    }

    const gstAmountMinor = percentageMinor(taxableAmountMinor, 500)
    const tcsBasisMinor = input.issuer === "NTC" ? taxableAmountMinor + gstAmountMinor : 0
    const tcsAmountMinor = input.issuer === "NTC" ? percentageMinor(tcsBasisMinor, 200) : 0
    const taxAmountMinor = gstAmountMinor + tcsAmountMinor
    const totalAmountMinor = taxableAmountMinor + taxAmountMinor - discountAmountMinor
    if (!Number.isSafeInteger(totalAmountMinor) || totalAmountMinor < 0) {
        throw new RangeError("Calculated booking total is invalid")
    }

    return {
        issuer: input.issuer,
        taxableAmount: toRupees(taxableAmountMinor),
        discountAmount: toRupees(discountAmountMinor),
        gstAmount: toRupees(gstAmountMinor),
        tcsBasis: toRupees(tcsBasisMinor),
        tcsAmount: toRupees(tcsAmountMinor),
        taxAmount: toRupees(taxAmountMinor),
        totalAmount: toRupees(totalAmountMinor),
        taxLabel: input.issuer === "NTC" ? "GST + TCS" : "GST",
    }
}

export function buildWebsiteBillingSnapshot(input: {
    issuer: WebsiteFinanceIssuer
    taxableAmount: number
    discountAmount: number
    currency: string
}) {
    const currency = input.currency.trim().toUpperCase()
    if (!/^[A-Z]{3}$/.test(currency)) throw new RangeError("Billing currency is invalid")

    const totals = calculateWebsiteBookingTotals(input)
    if (totals.taxableAmount <= 0 || totals.totalAmount <= 0) {
        throw new RangeError("A positive booking amount is required for a billing snapshot")
    }
    return {
        version: 1 as const,
        issuer: totals.issuer,
        isGstInvoice: true,
        currency,
        taxableAmountMinor: toMinor(totals.taxableAmount, "Taxable amount"),
        discountAmountMinor: toMinor(totals.discountAmount, "Discount amount"),
        gstAmountMinor: toMinor(totals.gstAmount, "GST amount"),
        tcsBasisMinor: toMinor(totals.tcsBasis, "TCS basis"),
        tcsAmountMinor: toMinor(totals.tcsAmount, "TCS amount"),
        totalAmountMinor: toMinor(totals.totalAmount, "Total amount"),
        taxPercent: 5,
        taxLabel: totals.taxLabel,
    }
}
