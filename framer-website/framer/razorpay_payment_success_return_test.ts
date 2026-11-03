import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildRazorpayPaymentSuccessUrl } from "./razorpay_payment_success_return.ts";

Deno.test("payment success return includes only the booking and signed status token", () => {
  const result = buildRazorpayPaymentSuccessUrl(
    "https://tripwithnomads.com/",
    "booking id",
    "signed/token",
  );

  assertEquals(
    result,
    "https://tripwithnomads.com/payment-success?booking_id=booking+id&status_token=signed%2Ftoken",
  );
});

Deno.test("payment success return rejects incomplete booking status credentials", () => {
  assertEquals(
    buildRazorpayPaymentSuccessUrl(
      "https://tripwithnomads.com",
      "",
      "token_123",
    ),
    null,
  );
  assertEquals(
    buildRazorpayPaymentSuccessUrl(
      "https://tripwithnomads.com",
      "booking_123",
      "",
    ),
    null,
  );
  assertEquals(
    buildRazorpayPaymentSuccessUrl("", "booking_123", "token_123"),
    null,
  );
});
