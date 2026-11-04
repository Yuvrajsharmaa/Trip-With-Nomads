import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildRazorpayPaymentStatusUrl } from "./razorpay_payment_success_return.ts";

Deno.test("payment success return includes only the booking and signed status token", () => {
  const result = buildRazorpayPaymentStatusUrl(
    "https://tripwithnomads.com/",
    "booking id",
    "signed/token",
    "payment-success",
  );

  assertEquals(
    result,
    "https://tripwithnomads.com/payment-success?booking_id=booking+id&status_token=signed%2Ftoken",
  );
});

Deno.test("payment failure return uses the same signed booking status credentials", () => {
  assertEquals(
    buildRazorpayPaymentStatusUrl(
      "https://tripwithnomads.com",
      "booking-123",
      "signed-token",
      "payment-failed",
    ),
    "https://tripwithnomads.com/payment-failed?booking_id=booking-123&status_token=signed-token",
  );
});

Deno.test("payment success return rejects incomplete booking status credentials", () => {
  assertEquals(
    buildRazorpayPaymentStatusUrl(
      "https://tripwithnomads.com",
      "",
      "token_123",
      "payment-success",
    ),
    null,
  );
  assertEquals(
    buildRazorpayPaymentStatusUrl(
      "https://tripwithnomads.com",
      "booking_123",
      "",
      "payment-success",
    ),
    null,
  );
  assertEquals(
    buildRazorpayPaymentStatusUrl(
      "",
      "booking_123",
      "token_123",
      "payment-success",
    ),
    null,
  );
});
