import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

async function read(name: string): Promise<string> {
  return await Deno.readTextFile(new URL(`./${name}`, import.meta.url));
}

function includes(source: string, value: string): void {
  assertEquals(
    source.includes(value),
    true,
    `Expected source to include ${value}`,
  );
}

Deno.test("checkout and payment retry call only named Supabase functions", async () => {
  const checkout = await read("CheckoutPageOverrides.tsx");
  const status = await read("BookingStatusOverride.tsx");
  const leadCapture = await read("EmailPopupOverride.tsx");

  for (const source of [checkout, status, leadCapture]) {
    assertEquals(source.includes("apiBaseUrl"), false);
    assertEquals(source.includes("twn-checkout-gateway-staging"), false);
  }

  includes(status, "${runtime.supabaseUrl}/functions/v1/retry-payment");
  includes(status, "apikey: runtime.supabaseAnonKey");
  includes(status, "Authorization: `Bearer ${runtime.supabaseAnonKey}`");
  assertEquals(checkout.includes("checkoutApiUrl(path"), false);
  includes(checkout, "${SUPABASE_URL}/functions/v1/record-lead");
  includes(checkout, "${SUPABASE_URL}/functions/v1/create-booking");
  includes(
    leadCapture,
    "https://${projectRef}.supabase.co/functions/v1/record-lead",
  );
  assertEquals(checkout.includes("fetch(RECORD_LEAD_URL, {"), true);
  assertEquals(
    checkout.includes("fetchCheckoutRequest(CREATE_BOOKING_URL"),
    true,
  );
  const checkoutHeaders = checkout.slice(
    checkout.indexOf("function checkoutApiHeaders"),
    checkout.indexOf("async function fetchCheckoutRequest"),
  );
  const formHeaders = checkout.slice(
    checkout.indexOf("const formHeaders:"),
    checkout.indexOf(
      "res = await fetchCheckoutRequest(CREATE_BOOKING_URL",
      checkout.indexOf("const formHeaders:"),
    ),
  );
  includes(checkoutHeaders, "apikey: SUPABASE_KEY");
  includes(checkoutHeaders, "Authorization: `Bearer ${SUPABASE_KEY}`");
  includes(formHeaders, "apikey: SUPABASE_KEY");
  includes(formHeaders, "Authorization: `Bearer ${SUPABASE_KEY}`");
  assertEquals(checkout.includes("/functions/v1/${"), false);
  assertEquals(status.includes("fetch(retryApiUrl(), {"), true);
});

Deno.test("Razorpay success handlers return to the matching signed booking status", async () => {
  const checkout = await read("CheckoutPageOverrides.tsx");
  const status = await read("BookingStatusOverride.tsx");
  const checkoutGateway = checkout.slice(
    checkout.indexOf("async function openRazorpayCheckout"),
    checkout.indexOf("type Traveller"),
  );
  const retryGateway = status.slice(
    status.indexOf("async function openRetryRazorpay"),
    status.indexOf("// ─── TYPES"),
  );

  for (const gateway of [checkoutGateway, retryGateway]) {
    includes(gateway, "redirect: false");
    includes(gateway, "handler: ()");
    includes(gateway, "buildRazorpayPaymentStatusUrl(");
    includes(gateway, "window.location.assign(statusUrl)");
    assertEquals(gateway.includes("callback_url:"), false);
  }
  includes(checkoutGateway, "!data?.booking_id || !data?.status_token");
  const failedHandler = checkoutGateway.slice(
    checkoutGateway.indexOf('instance.on?.("payment.failed"'),
  );
  includes(failedHandler, '"payment-failed"');
  includes(failedHandler, "window.location.assign(statusUrl)");
  assertEquals(failedHandler.includes('"payment-success"'), false);
  includes(
    retryGateway,
    'String(payload?.booking_id || "") !== String(data.id)',
  );
  includes(retryGateway, "!payload?.status_token");
});

Deno.test("public checkout functions reject methods other than POST", async () => {
  const createBooking = await Deno.readTextFile(
    new URL("../supabase/functions/create-booking/index.ts", import.meta.url),
  );
  const retryPayment = await Deno.readTextFile(
    new URL("../supabase/functions/retry-payment/index.ts", import.meta.url),
  );
  const recordLead = await Deno.readTextFile(
    new URL("../supabase/functions/record-lead/index.ts", import.meta.url),
  );

  for (const source of [createBooking, retryPayment, recordLead]) {
    const optionsIndex = source.indexOf('if (req.method === "OPTIONS")');
    const postGuardIndex = source.indexOf('if (req.method !== "POST")');
    assertEquals(optionsIndex >= 0, true);
    assertEquals(postGuardIndex > optionsIndex, true);
    includes(source, 'error: "Method not allowed"');
    assertEquals(
      source.includes("status: 405") || source.includes("}, 405)"),
      true,
    );
  }
});

Deno.test("public checkout handlers constrain privileged writes to server-derived values", async () => {
  const createBooking = await Deno.readTextFile(
    new URL("../supabase/functions/create-booking/index.ts", import.meta.url),
  );
  const retryPayment = await Deno.readTextFile(
    new URL("../supabase/functions/retry-payment/index.ts", import.meta.url),
  );

  assertEquals(createBooking.includes("computeBasePricing"), true);
  assertEquals(createBooking.includes("loadWebsiteTripCatalogPricing"), true);
  assertEquals(createBooking.includes('payment_status: "pending"'), true);
  assertEquals(createBooking.includes("body?.total_amount"), false);
  assertEquals(createBooking.includes("body?.paid_amount"), false);
  assertEquals(createBooking.includes("body?.payment_status"), false);
  assertEquals(createBooking.includes("body?.due_amount"), false);
  assertEquals(createBooking.includes("body?.payable_now_amount"), false);
  assertEquals(retryPayment.includes("bookingEmail !== providedEmail"), true);
  assertEquals(retryPayment.includes("const amountToRetry ="), true);
  assertEquals(retryPayment.includes("body?.amount"), false);
  assertEquals(retryPayment.includes("body?.amount_minor"), false);
  assertEquals(retryPayment.includes("req.url"), false);
});
