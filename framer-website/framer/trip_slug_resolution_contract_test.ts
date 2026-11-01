import {
  assert,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

const source = await Deno.readTextFile(
  new URL("./TripPriceOverrides.tsx", import.meta.url),
);

Deno.test("trip cards prefer explicit CMS slugs and scan nested props safely", () => {
  const start = source.indexOf(
    "function readTripSlugCandidate(props: any): string",
  );
  const end = source.indexOf("\n}", start) + 2;
  const reader = source.slice(start, end);

  assert(start >= 0, "Trip price override must resolve a slug candidate");
  const explicitCandidatePass = reader.indexOf(
    "for (const key of TRIP_SLUG_PROP_KEYS)",
  );
  const legacyFallback = reader.indexOf(
    "readTripSlugFallback(props?.text, props?.children)",
  );
  const nestedFallback = reader.indexOf("return findSlugInCmsProps(props)");
  assert(
    explicitCandidatePass >= 0 && legacyFallback > explicitCandidatePass &&
      nestedFallback > legacyFallback,
    "Explicit CMS slugs, then legacy bindings, must precede generic nested scanning",
  );
  assertStringIncludes(reader, "findSlugInCmsProps(props)");
  assertStringIncludes(
    source,
    'function findSlugInCmsProps(value: any, depth = 0, key = ""): string',
  );
  assertStringIncludes(source, "TRIP_SLUG_SCAN_SKIP_KEYS");
  assertStringIncludes(source, "TRIP_SLUG_SCAN_SKIP_KEYS.has(propKey)");
  assertStringIncludes(source, "UUID_REGEX.test(raw)");
  assertStringIncludes(
    source,
    'TRIP_SLUG_PROP_KEYS.includes(key) || fromPath || slug.includes("-")',
  );
  assertStringIncludes(source, 'if (depth > 3 || value == null) return ""');
  assertStringIncludes(
    source,
    "const slugFromPath = getTripSlugFromPathname(window.location.pathname)",
  );
  assertStringIncludes(source, "const slug = propSlug || slugFromPath");
  assertStringIncludes(
    source,
    'import { readTripSlugFallback } from "./trip_slug_resolution.ts"',
  );
});

Deno.test("a card slug takes precedence over a page-level trip ID", () => {
  const start = source.indexOf("function useTripDisplayData(props?: any)");
  const end = source.indexOf("export function withTripPrimaryPrice", start);
  const display = source.slice(start, end);

  assert(start >= 0, "Trip card price lookup should exist");
  assertStringIncludes(
    display,
    "const hasScopedSlug = Boolean(propSlug || slugFromPath)",
  );
  assertStringIncludes(display, "const tripId = propTripId || (!hasScopedSlug");
  assertStringIncludes(display, "const slug = propSlug || slugFromPath");
});
