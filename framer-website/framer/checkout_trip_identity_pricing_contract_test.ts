import {
  assert,
  assertFalse,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

const source = await Deno.readTextFile(
  new URL("./CheckoutPageOverrides.tsx", import.meta.url),
);

Deno.test("checkout links and display pricing are ID-first", () => {
  const bookNowStart = source.indexOf("export function withBookNowToCheckout");
  const checkoutIdStart = source.indexOf(
    "export function withCheckoutTripId",
    bookNowStart,
  );
  const bookNow = source.slice(bookNowStart, checkoutIdStart);

  assert(bookNowStart >= 0, "Book now override should exist");
  assertStringIncludes(bookNow, "const currentSlug = normalizeSlug");
  assertStringIncludes(bookNow, "fetchTripIdBySlug(currentSlug)");
  assertStringIncludes(bookNow, "const slug = currentSlug ||");
  assertStringIncludes(bookNow, "getPageScopedTripId");
  assertStringIncludes(bookNow, 'if (tripId) next.set("tripId", tripId)');
  assertStringIncludes(bookNow, 'if (slug) next.set("slug", slug)');
  assertStringIncludes(bookNow, "const sameTrip = Boolean");
  assertFalse(
    bookNow.includes(
      "|| normalizeTripId(store.tripId) || getPageScopedTripId()",
    ),
  );

  const displayStart = source.indexOf("function useTripDisplayData");
  const displayEnd = source.indexOf(
    "export function withTripPrimaryPrice",
    displayStart,
  );
  const display = source.slice(displayStart, displayEnd);
  assertStringIncludes(source, "async function resolveTripDisplayIdentity");
  assertStringIncludes(source, "fetchTripContextById(pageTripId)");
  assertStringIncludes(source, "normalizeSlug(pageContext?.slug) === pathSlug");
  assertStringIncludes(source, "fetchTripIdBySlug(pathSlug)");
  assertStringIncludes(display, "await resolveTripDisplayIdentity");
  assertStringIncludes(display, "fetchTripDisplayPrice(identity)");
  assertStringIncludes(
    source,
    'const isCheckoutPath = pathname.toLowerCase().startsWith("/checkout")',
  );
  assertStringIncludes(display, "const [locationKey, setLocationKey]");

  const bootstrapStart = source.indexOf(
    "export function withCheckoutBootstrap",
  );
  const bootstrapEnd = source.indexOf(
    "export function withBookNowToCheckout",
    bootstrapStart,
  );
  const bootstrap = source.slice(bootstrapStart, bootstrapEnd);
  assertStringIncludes(bootstrap, "if (ctx.tripId && !tripContext)");
  assertStringIncludes(bootstrap, "slug = tripId");
  assertStringIncludes(bootstrap, 'String(tripContext?.slug || "").trim()');
});

Deno.test("Total trip cost is pre-tax while payable now remains final", () => {
  const totalStart = source.indexOf(
    "export function withCheckoutGrandTotal(Component)",
  );
  const totalEnd = source.indexOf(
    "export function withCheckoutPayableNowLabel",
    totalStart,
  );
  const totalOverride = source.slice(totalStart, totalEnd);

  assertStringIncludes(totalOverride, "computeTotals(store).subtotal");
  assertFalse(totalOverride.includes("computeTotals(store).total"));
});
