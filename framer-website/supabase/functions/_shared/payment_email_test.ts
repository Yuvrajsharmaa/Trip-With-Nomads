import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildPaymentEmail } from "./payment_email.ts";

const pendingBooking = {
  id: "booking-123",
  booking_ref: "TWN-2026-00123",
  name: "Guest User",
  email: "guest@example.com",
  departure_date: "2026-05-09",
  travellers: [
    { id: 1, name: "Guest User", sharing: "Double", transport: "SUV" },
    { id: 2, name: "A <Guest>", sharing: "Quad", transport: "Bike" },
    { id: 3, name: "Third Traveller", sharing: "Double", transport: "SUV" },
  ],
  payment_breakdown: [
    {
      count: 2,
      variant: "Double",
      transport: "SUV",
      unit_price: 8000,
      price: 16000,
    },
    {
      count: 1,
      variant: "Quad",
      transport: "Bike",
      unit_price: 6000,
      price: 6000,
    },
  ],
  subtotal_amount: 22000,
  discount_amount: 1000,
  coupon_code: "NOMAD10",
  tax_amount: 3780,
  total_amount: 24780,
  currency: "INR",
  payable_now_amount: 24780,
  paid_amount: 0,
  due_amount: 0,
  payment_status: "pending",
  settlement_status: "pending",
  payment_mode: "full",
  payment_gateway_txn_id: "",
};

Deno.test("builds a designed paid email with booking details", () => {
  const email = buildPaymentEmail(
    pendingBooking,
    {
      ...pendingBooking,
      payment_status: "paid",
      settlement_status: "fully_paid",
      paid_amount: 24780,
      payment_gateway_txn_id: "pay_123",
    },
    "Summer Spiti",
  );

  assert(email);
  assertEquals(email.to, "guest@example.com");
  assertEquals(
    email.subject,
    "Booking confirmed: Summer Spiti | TWN-2026-00123",
  );
  assertStringIncludes(email.html, "A &lt;Guest&gt;");
  assertStringIncludes(email.html, "9 May 2026");
  assertStringIncludes(email.html, "3 pax");
  assertStringIncludes(email.html, "2 x Double | SUV");
  assertStringIncludes(email.html, "1 x Quad | Bike");
  assertStringIncludes(email.html, "Discount (NOMAD10)");
  assertStringIncludes(email.html, "₹24,780.00");
  assertStringIncludes(email.text, "Pax: 3 pax");
  assertStringIncludes(email.text, "Payment reference: pay_123");
});

Deno.test("builds a partial-payment email with the balance due", () => {
  const email = buildPaymentEmail(
    pendingBooking,
    {
      ...pendingBooking,
      payment_mode: "partial_25",
      payable_now_amount: 6195,
      payment_status: "paid",
      settlement_status: "partially_paid",
      paid_amount: 6195,
      due_amount: 18585,
      payment_gateway_txn_id: "pay_partial",
    },
    "Summer Spiti",
  );

  assert(email);
  assertEquals(
    email.subject,
    "Advance received: Summer Spiti | TWN-2026-00123",
  );
  assertStringIncludes(email.html, "25% advance payment");
  assertStringIncludes(email.html, "Balance due");
  assertStringIncludes(email.text, "Balance due: ₹18,585.00");
});

Deno.test("builds a failed email with the signed retry destination", () => {
  const retryUrl =
    "https://staging.tripwithnomads.com/payment-failed?booking_id=booking-123&status_token=abc";
  const email = buildPaymentEmail(
    pendingBooking,
    {
      ...pendingBooking,
      payment_status: "failed",
      settlement_status: "failed",
      payable_now_amount: 24780,
      payment_gateway_txn_id: "pay_failed",
    },
    "Summer Spiti",
    "https://staging.tripwithnomads.com",
    retryUrl,
  );

  assert(email);
  assertEquals(
    email.subject,
    "Action needed: complete payment | TWN-2026-00123",
  );
  assertStringIncludes(email.html, "Payment not completed");
  assertStringIncludes(email.html, "not confirmed yet");
  assertStringIncludes(email.html, "Try payment again");
  assertStringIncludes(email.html, "status_token=abc");
  assertStringIncludes(email.text, "Try payment again: " + retryUrl);
});

Deno.test("uses the configured site URL for environment-safe email links", () => {
  const email = buildPaymentEmail(
    pendingBooking,
    {
      ...pendingBooking,
      payment_status: "paid",
      settlement_status: "fully_paid",
      paid_amount: 24780,
      payment_gateway_txn_id: "pay_staging",
    },
    "Summer Spiti",
    "https://staging.tripwithnomads.com/",
  );

  assert(email);
  assertStringIncludes(email.html, "https://staging.tripwithnomads.com");
  assertEquals(email.html.includes('https://tripwithnomads.com"'), false);
});

Deno.test("does not build an email for a repeated unchanged callback", () => {
  const booking = {
    ...pendingBooking,
    payment_status: "paid",
    settlement_status: "fully_paid",
    paid_amount: 24780,
    payment_gateway_txn_id: "pay_123",
  };

  assertEquals(buildPaymentEmail(booking, booking, "Summer Spiti"), null);
});
