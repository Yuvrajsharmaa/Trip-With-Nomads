import {
  assert,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

Deno.test("CRM finance events are acknowledged after signature validation and before website persistence", async () => {
  const source = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );
  const signatureCheckIndex = source.indexOf(
    "!constantTimeEqual(receivedSignature, expectedSignature)",
  );
  const crmIgnoreIndex = source.indexOf("isCrmFinancePaymentEvent(event)");
  const eventReservationIndex = source.indexOf(
    "reservation = await reservePaymentEvent({",
  );

  assert(signatureCheckIndex >= 0);
  assert(crmIgnoreIndex > signatureCheckIndex);
  assert(eventReservationIndex > crmIgnoreIndex);
  assertStringIncludes(source, "CRM Finance payment event");
});
