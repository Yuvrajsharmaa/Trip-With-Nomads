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
  assertStringIncludes(email.html, "padding:20px 0;");
  assertStringIncludes(email.html, "padding:24px 12px 0;");
  assertStringIncludes(email.html, "padding:0;background:#f6fcff;");
  assertStringIncludes(email.html, "padding:28px 12px 30px;");
  assertEquals(email.html.includes("padding:20px 8px;"), false);
  assertEquals(email.html.includes("padding:24px 16px 8px;"), false);
  assertEquals(email.html.includes("border:1px solid #cbeafa"), false);
  assertEquals(email.html.includes("border:1px solid #dceef7"), false);
  assertEquals(
    email.subject,
    "Payment received: Summer Spiti | TWN-2026-00123",
  );
  assertStringIncludes(email.html, "A &lt;Guest&gt;");
  assertStringIncludes(email.html, "9 May 2026");
  assertStringIncludes(email.html, "3 travellers");
  assertStringIncludes(email.html, "We received your payment for Summer Spiti. Your booking is paid in full.");
  assertEquals(email.html.includes("Booking confirmed: Summer Spiti"), false);
  assertEquals(email.html.includes("Payment received in full. Your booking is confirmed."), false);
  assertEquals(email.html.includes("Trip Type:"), false);
  assertEquals(email.html.includes("We are delighted"), false);
  assertEquals(email.html.includes("Please review the booking summary"), false);
  assertEquals(email.html.includes("Thank you for choosing Trip With Nomads"), false);
  assertStringIncludes(email.html, "Trip options");
  assertStringIncludes(email.html, "2 x Double | SUV");
  assertStringIncludes(email.html, "1 x Quad | Bike");
  assertEquals(email.html.split("Double | SUV").length - 1, 1);
  assertEquals(email.html.split("Quad | Bike").length - 1, 1);
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
  assertEquals(email.html.includes("Unsubscribe"), false);
  assertEquals(email.headers?.["List-Unsubscribe"], undefined);
  assertStringIncludes(email.text, "We received your payment for Summer Spiti. Your booking is paid in full.");
  assertEquals(email.text.includes("Booking and payment messages may still be sent"), false);
  assertStringIncludes(email.text, "Travellers: 3");
  assertStringIncludes(
    email.text,
    "Travellers:\n- Guest User\n- A <Guest>\n- Third Traveller\n\nTrip options:\n- 2 x Double | SUV",
  );
  assertEquals(email.html.includes("Variant selections"), false);
  assertEquals(email.text.includes("Pax:"), false);
  assertEquals(email.text.includes("Selections:"), false);
  assertEquals(email.text.includes("- A <Guest> | Quad | Bike"), false);
  assertStringIncludes(email.text, "Payment reference: pay_123");
});

Deno.test("payment email omits empty traveller and trip-option filler", () => {
  const booking = {
    ...pendingBooking,
    travellers: [],
    payment_breakdown: [],
    payment_status: "paid",
    settlement_status: "fully_paid",
    paid_amount: 24780,
  };
  const email = buildPaymentEmail(
    pendingBooking,
    booking,
    "Summer Spiti",
  );

  assert(email);
  assertEquals(email.html.includes("Selection details are recorded with your booking."), false);
  assertEquals(email.html.includes("No variant breakdown available."), false);
  assertEquals(email.text.includes("Selection details are recorded with your booking."), false);
  assertEquals(email.text.includes("No variant breakdown available."), false);
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
  assertStringIncludes(email.html, "We received your advance for Summer Spiti. ₹18,585.00 remains due.");
  assertStringIncludes(email.html, "Balance due for Summer Spiti: ₹18,585.00.");
  assertEquals(email.html.includes("14 days"), false);
  assertEquals(email.html.includes("Bank details"), false);
  assertEquals(email.html.includes("8447333965"), false);
  assertEquals(email.text.includes("14 days"), false);
  assertEquals(email.text.includes("Account number:"), false);
  assertStringIncludes(email.text, "Balance due: ₹18,585.00");
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
    "Payment not completed | TWN-2026-00123",
  );
  assertStringIncludes(
    email.html,
    'src="https://framerusercontent.com/assets/jtbxonFosA8D3IAyIFdpHJMXUPI.gif" alt="Payment not completed"',
  );
  assertStringIncludes(email.html, "We couldn’t confirm your payment for Summer Spiti. If your bank shows a debit, contact us before trying again.");
  assertEquals(email.html.includes("Please review the booking summary"), false);
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
