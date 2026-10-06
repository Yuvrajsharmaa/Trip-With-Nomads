import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { listBookingStatusSecrets } from "./booking_status_token.ts";

Deno.test("status-token verification retains Razorpay and legacy PayU secrets", () => {
  const values: Record<string, string> = {
    BOOKING_STATUS_TOKEN_SECRET: "status-secret",
    RAZORPAY_LIVE_KEY_SECRET: "razorpay-live-secret",
    RAZORPAY_TEST_KEY_SECRET: "razorpay-test-secret",
    RAZORPAY_KEY_SECRET: "razorpay-live-secret",
    PAYU_LIVE_SALT: "payu-live-salt",
    PAYU_TEST_SALT: "payu-test-salt",
    PAYU_SALT: "payu-fallback-salt",
  };

  assertEquals(
    listBookingStatusSecrets({ get: (name) => values[name] }),
    [
      "status-secret",
      "razorpay-live-secret",
      "razorpay-test-secret",
      "payu-live-salt",
      "payu-test-salt",
      "payu-fallback-salt",
    ],
  );
});
