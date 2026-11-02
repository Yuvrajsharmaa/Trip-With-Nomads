import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isAllowedAbandonedCheckoutOrigin } from "./checkout_abandon_origin.ts";

Deno.test("abandonment capture accepts only the production and owned Framer sites", () => {
  assertEquals(
    isAllowedAbandonedCheckoutOrigin("https://tripwithnomads.com"),
    true,
  );
  assertEquals(
    isAllowedAbandonedCheckoutOrigin("https://www.tripwithnomads.com"),
    true,
  );
  assertEquals(
    isAllowedAbandonedCheckoutOrigin("https://maroon-aside-814100.framer.app"),
    true,
  );
  assertEquals(
    isAllowedAbandonedCheckoutOrigin(
      "https://maroon-aside-814100--sunlit-mosaic.framer.app",
    ),
    true,
  );
  assertEquals(isAllowedAbandonedCheckoutOrigin("http://localhost:3000"), true);
});

Deno.test("abandonment capture rejects lookalike and unrelated origins", () => {
  assertEquals(
    isAllowedAbandonedCheckoutOrigin(
      "https://tripwithnomads.com.attacker.example",
    ),
    false,
  );
  assertEquals(
    isAllowedAbandonedCheckoutOrigin("https://other-project.framer.app"),
    false,
  );
  assertEquals(
    isAllowedAbandonedCheckoutOrigin("http://tripwithnomads.com"),
    false,
  );
  assertEquals(isAllowedAbandonedCheckoutOrigin("null"), false);
});
