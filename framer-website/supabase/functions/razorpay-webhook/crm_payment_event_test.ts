import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isCrmFinancePaymentEvent } from "./crm_payment_event.ts";

Deno.test("recognizes CRM payment-link captures from their payment request note", () => {
  const event = {
    event: "payment.captured",
    payload: {
      payment: {
        entity: {
          notes: {
            booking_id: "booking-123",
            payment_request_id: "request-456",
          },
        },
      },
      order: {
        entity: {
          notes: {
            booking_id: "booking-123",
            payment_request_id: "request-456",
          },
        },
      },
    },
  };

  assert(isCrmFinancePaymentEvent(event));
});

Deno.test("does not classify a website checkout order as a CRM finance event", () => {
  const event = {
    event: "payment.captured",
    payload: {
      payment: { entity: { notes: { booking_id: "booking-123" } } },
      order: { entity: { notes: { booking_id: "booking-123" } } },
    },
  };

  assert(!isCrmFinancePaymentEvent(event));
});

Deno.test("does not classify malformed payloads as CRM finance events", () => {
  assert(!isCrmFinancePaymentEvent(null));
  assert(
    !isCrmFinancePaymentEvent({
      payload: { payment: { entity: { notes: null } } },
    }),
  );
});
