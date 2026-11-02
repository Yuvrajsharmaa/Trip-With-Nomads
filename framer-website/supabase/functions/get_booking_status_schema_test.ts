import { assert, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts"

const source = await Deno.readTextFile(new URL("./get-booking-status/index.ts", import.meta.url))

Deno.test("status projection uses provider-neutral transaction fields", () => {
  assertStringIncludes(source, "payment_gateway_txn_id")
  assert(!source.includes("payu_txnid"), "status projection must not depend on retired PayU column")
  assertStringIncludes(source, "cache-control")
})

Deno.test("status response exposes retries only after an unpaid provider-order setup expires", () => {
  assertStringIncludes(source, 'from("payment_attempts")')
  assertStringIncludes(source, "canOfferPaymentRetry(booking, activeAttempt)")
  assertStringIncludes(source, "payment_retry_available: paymentRetryAvailable")
})

Deno.test("status response never exposes retry for cancelled or already-paid bookings", () => {
  assertStringIncludes(source, "canOfferPaymentRetry(booking, activeAttempt)")
  assertStringIncludes(source, "currency, status, payment_status, payment_mode")
  assertStringIncludes(source, "paid_amount")
})

Deno.test("status retry lookup includes provider orders so an expired order can be resumed", () => {
  assertStringIncludes(source, 'select("id, status, provider_order_id, expires_at, created_at, updated_at")')
  assertStringIncludes(source, "paymentRetryAvailable = canOfferPaymentRetry(booking, activeAttempt)")
})
