import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  bookingStatusDetailsReady,
  bookingStatusView,
  verifiedStatusDestination,
} from "./booking_status_presentation_state.ts";
import * as statusPresentation from "./booking_status_presentation_state.ts";

Deno.test("status page hides booking content until a terminal server result", () => {
  assertEquals(bookingStatusView("loading"), "checking");
  assertEquals(bookingStatusView("pending", "pending"), "checking");
  assertEquals(bookingStatusView("ready", "pending"), "pending");
  assertEquals(bookingStatusView("error"), "unavailable");
  assertEquals(bookingStatusView("ready", "unknown"), "unavailable");
  assertEquals(bookingStatusView("ready", "paid"), "success");
  assertEquals(bookingStatusView("ready", "succeeded"), "success");
  assertEquals(bookingStatusView("ready", "failed"), "failed");
});

Deno.test("verified outcomes stay hidden until booking details are ready", () => {
  assertEquals(bookingStatusView("ready", "paid", false), "checking");
  assertEquals(bookingStatusView("ready", "failed", false), "checking");
  assertEquals(bookingStatusView("ready", "paid", true), "success");
  assertEquals(bookingStatusView("ready", "succeeded", true), "success");
  assertEquals(bookingStatusView("ready", "failed", true), "failed");
});

Deno.test("booking details require the fields shown on the outcome page", () => {
  const complete = {
    id: "booking-id",
    trip_title: "Vietnam",
    departure_date: "2026-12-25",
    currency: "INR",
    travellers: [{ name: "Asha", sharing: "Double" }],
    total_amount: "1000",
    tax_amount: 50,
  };
  assertEquals(bookingStatusDetailsReady(complete), true);
  assertEquals(
    bookingStatusDetailsReady({ ...complete, trip_title: null }),
    false,
  );
  assertEquals(
    bookingStatusDetailsReady({ ...complete, travellers: [] }),
    false,
  );
  assertEquals(
    bookingStatusDetailsReady({ ...complete, travellers: [{ name: "Asha" }] }),
    false,
  );
  assertEquals(
    bookingStatusDetailsReady({ ...complete, total_amount: null }),
    false,
  );
});

Deno.test("terminal results stay on the current loader until required details arrive", async () => {
  const source = await Deno.readTextFile(
    new URL("./BookingStatusOverride.tsx", import.meta.url),
  );
  assert(
    source.includes("bookingStatusDetailsReady(booking)"),
    "terminal redirect skips booking readiness",
  );
  assert(
    source.includes("const detailsReady = bookingStatusDetailsReady(data)"),
    "render gate does not validate booking details",
  );
  assert(
    source.includes(
      "bookingStatusView(state, data?.payment_status, detailsReady)",
    ),
    "render gate skips booking readiness",
  );
});

Deno.test("only verified terminal statuses select a success or failure route", () => {
  assertEquals(verifiedStatusDestination("paid"), "/payment-success");
  assertEquals(verifiedStatusDestination("succeeded"), "/payment-success");
  assertEquals(verifiedStatusDestination("failed"), "/payment-failed");
  assertEquals(verifiedStatusDestination("pending"), null);
  assertEquals(verifiedStatusDestination("unknown"), null);
});

Deno.test("booking content appears only after a terminal status is ready", () => {
  const shouldShow = (statusPresentation as any).shouldShowBookingStatusContent;
  assertEquals(shouldShow(false, "success"), false);
  assertEquals(shouldShow(true, "checking"), false);
  assertEquals(shouldShow(true, "pending"), false);
  assertEquals(shouldShow(true, "unavailable"), false);
  assertEquals(shouldShow(true, "success"), true);
  assertEquals(shouldShow(true, "failed"), true);
});

Deno.test("payment confirmation copy distinguishes waiting from unavailable status", () => {
  const copy = (statusPresentation as any).bookingStatusCopy;
  assertEquals(copy("loading"), {
    title: "Your trip is getting ready",
    description:
      "We’re confirming your payment with the bank. Your booking details will appear here once it’s confirmed. Please keep this page open and don’t try again yet.",
  });
  assertEquals(copy("pending"), {
    title: "Your payment is still processing",
    description:
      "Your bank may still be processing it. Check the status before trying another payment.",
  });
  assertEquals(copy("unavailable"), {
    title: "We can’t confirm your payment yet",
    description:
      "Check again before making another payment, or contact us if your account was charged.",
  });
  assertEquals(copy("details"), {
    title: "Your booking details are taking longer",
    description:
      "We’ve received a payment update. Refresh to load your booking, or contact us if your account was charged.",
  });
});
