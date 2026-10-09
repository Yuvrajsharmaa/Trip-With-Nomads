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
  assertStringIncludes(
    email.html,
    "We are delighted to inform you that your booking for Summer Spiti has been successfully confirmed.",
  );
  assertEquals(email.html.includes("Trip Type:"), false);
  assertStringIncludes(
    email.html,
    "Please review the booking summary below, including your traveller details, selected variant, and payment information.",
  );
  assertStringIncludes(email.html, "2 x Double | SUV");
  assertStringIncludes(email.html, "1 x Quad | Bike");
  assertStringIncludes(email.html, "Discount (NOMAD10)");
  assertStringIncludes(email.html, "₹24,780.00");
  assertStringIncludes(email.html, "#08b1ff");
  assertStringIncludes(
    email.html,
    "background:linear-gradient(180deg,#ffffff 0%,#08b1ff 100%)",
  );
  assertEquals(email.html.includes("linear-gradient(135deg"), false);
  assertStringIncludes(
    email.html,
    'data-payment-animation="gif"',
  );
  assertStringIncludes(
    email.html,
    'src="https://framerusercontent.com/assets/iF1Zm5lDZ2Wpg9hNFHHZ5YMUxJM.gif" alt="Payment received"',
  );
  assertEquals(email.html.includes("lottie"), false);
  assertEquals(email.html.includes("payment-animation-fallback"), false);
  assertEquals(email.html.includes("Nice one, nomad."), false);
  assertStringIncludes(email.html, "FR1lBzx4w9xp2fecFXEMUGGul4.png");
  assertStringIncludes(email.html, "Chat on WhatsApp");
  assertStringIncludes(
    email.html,
    'href="https://wa.me/918076425366?text=Hi%20Trip%20With%20Nomads%2C%20I%20need%20help%20with%20booking%20TWN-2026-00123."',
  );
  assertStringIncludes(email.html, "+91 8076425366");
  assertStringIncludes(email.html, 'href="tel:+918076425366"');
  assertStringIncludes(
    email.html,
    'href="https://tripwithnomads.com/privacy-policy"',
  );
  assertStringIncludes(
    email.html,
    'href="https://tripwithnomads.com/terms-and-conditions"',
  );
  assertStringIncludes(
    email.html,
    'href="https://tripwithnomads.com/cancellation-refund-policy"',
  );
  assertStringIncludes(email.html, 'href="https://tripwithnomads.com"');
  assertStringIncludes(email.html, "Unsubscribe");
  assertEquals(
    email.headers?.["List-Unsubscribe"],
    "<mailto:support@tripwithnomads.com?subject=Unsubscribe%20from%20Trip%20With%20Nomads%20emails>",
  );
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
  assertStringIncludes(email.html, "Important payment information");
  assertStringIncludes(email.html, "TRIP WITH NOMADS");
  assertStringIncludes(email.html, "8447333965");
  assertStringIncludes(email.html, "KKBK0004369");
  assertStringIncludes(email.html, "KOTAK MAHINDRA BANK");
  assertStringIncludes(email.html, "9318405401@kotak");
  assertStringIncludes(
    email.html,
    'href="https://maps.app.goo.gl/TS9umsDXBHxs6K2d6"',
  );
  assertStringIncludes(email.html, "Ballabgargh, Faridabad, Haryana, 121004");
  assertStringIncludes(
    email.text,
    "The pending amount must be cleared at least 14 days prior to your travel date.",
  );
  assertStringIncludes(email.text, "Balance due: ₹18,585.00");
  assertStringIncludes(email.text, "Account name: TRIP WITH NOMADS");
  assertStringIncludes(email.text, "Account number: 8447333965");
  assertStringIncludes(email.text, "IFSC code: KKBK0004369");
  assertStringIncludes(email.text, "Bank: KOTAK MAHINDRA BANK");
  assertStringIncludes(email.text, "UPI ID: 9318405401@kotak");
  assertStringIncludes(
    email.text,
    "Map: https://maps.app.goo.gl/TS9umsDXBHxs6K2d6",
  );
});

Deno.test("builds a failed email with the signed retry destination", () => {
  const retryUrl =
    "https://maroon-aside-814100.framer.app/payment-failed?booking_id=booking-123&status_token=abc";
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
    "https://maroon-aside-814100.framer.app",
    retryUrl,
  );

  assert(email);
  assertEquals(
    email.subject,
    "Action needed: complete payment | TWN-2026-00123",
  );
  assertStringIncludes(
    email.html,
    'src="https://framerusercontent.com/assets/jtbxonFosA8D3IAyIFdpHJMXUPI.gif" alt="Payment not completed"',
  );
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
    "https://maroon-aside-814100.framer.app/",
  );

  assert(email);
  assertStringIncludes(email.html, "https://maroon-aside-814100.framer.app");
  assertEquals(email.html.includes('https://tripwithnomads.com"'), false);
});

Deno.test("paid email uses the signed booking status destination", () => {
  const statusUrl =
    "https://maroon-aside-814100.framer.app/booking-status?booking_id=booking-123&status_token=signed-status";
  const email = buildPaymentEmail(
    pendingBooking,
    {
      ...pendingBooking,
      payment_status: "paid",
      settlement_status: "fully_paid",
      paid_amount: 24780,
      payment_gateway_txn_id: "pay_status",
    },
    "Summer Spiti",
    "https://maroon-aside-814100.framer.app",
    statusUrl,
  );

  assert(email);
  assertStringIncludes(email.html, "View booking status");
  assertStringIncludes(email.html, "status_token=signed-status");
  assertStringIncludes(
    email.html,
    'href="https://maroon-aside-814100.framer.app/booking-status?booking_id=booking-123&amp;status_token=signed-status"',
  );
  assertStringIncludes(email.text, "View booking status: " + statusUrl);
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
