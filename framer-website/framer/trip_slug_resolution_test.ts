import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { readTripSlugFallback } from "./trip_slug_resolution.ts";

Deno.test("keeps a valid slug passed through the text binding", () => {
  assertEquals(readTripSlugFallback("summer-spiti", undefined), "summer-spiti");
});

Deno.test("keeps a valid one-word slug passed through string children", () => {
  assertEquals(readTripSlugFallback(undefined, "ladakh"), "ladakh");
});

Deno.test("prefers text to children when both legacy bindings are present", () => {
  assertEquals(readTripSlugFallback("summer-spiti", "ladakh"), "summer-spiti");
});

Deno.test("normalizes trip URLs and rejects display copy or non-string children", () => {
  assertEquals(
    readTripSlugFallback(
      "https://tripwithnomads.com/upcoming-trips/summer-spiti",
      undefined,
    ),
    "summer-spiti",
  );
  assertEquals(readTripSlugFallback("Summer Spiti Expedition", {}), "");
});
