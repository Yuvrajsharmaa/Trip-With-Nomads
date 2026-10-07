import {
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

const source = await Deno.readTextFile(
  new URL("./index.ts", import.meta.url),
);

Deno.test("display pricing resolves an explicit trip ID before slug fallback", () => {
  assertStringIncludes(source, "const tripResult = tripId");
  assertStringIncludes(source, 'await tripQuery.eq("id", tripId)');
  assertStringIncludes(source, ': await tripQuery.eq("slug", slug)');
  assertStringIncludes(source, "fetchTripViaDirectDb({ tripId, slug })");
});
