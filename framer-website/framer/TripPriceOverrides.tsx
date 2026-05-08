import React from "react";
import type { ComponentType } from "react";

// Suppress ALL console output on production — only allow on staging/Framer hosts
if (typeof window !== "undefined") {
  const h = String(window.location.hostname || "").toLowerCase();
  const isStaging =
    h.includes("framer.app") || h.includes("framer.website") ||
    h === "framercanvas.com" || h.endsWith(".framercanvas.com") ||
    h.includes("framer.com") || h === "localhost";
  if (!isStaging) {
    const noop = () => {};
    console.log = noop;
    console.info = noop;
    console.warn = noop;
    console.error = noop;
    console.debug = noop;
  }
}
const { useEffect, useState, useMemo } = React;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_GLOBAL_REGEX =
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi;
const TRIP_ID_PROP_KEYS = [
  "tripId",
  "trip_id",
  "tripid",
  "awOOt0Clm",
];
let _forcedTripId = "";
const TRIP_ID_SOURCE_EVENT = "twn:trip-id-source";

function isFramerRuntimeHost(): boolean {
  if (typeof window === "undefined") return false;
  const hostname = String(window.location.hostname || "").toLowerCase();
  return (
    hostname.includes("framer.app") ||
    hostname.includes("framer.website") ||
    hostname === "framercanvas.com" ||
    hostname.endsWith(".framercanvas.com") ||
    hostname.includes("framer.com")
  );
}

/**
 * useHydrated: A helper hook to prevent React hydration mismatches (#418).
 * Ensures that components render the same content on server and first client pass.
 */
function useHydrated() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}

/**
 * useCurrentPathname: Tracks the current URL pathname reactively.
 * Handles both popstate (back/forward) and SPA navigation (pushState/replaceState).
 */
function useCurrentPathname(): string {
  const [pathname, setPathname] = useState(
    typeof window !== "undefined" ? window.location.pathname : "",
  );
  useEffect(() => {
    const update = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", update);
    const origPushState = window.history.pushState.bind(window.history);
    window.history.pushState = function (...args: any[]) {
      origPushState(...args);
      update();
    };
    const origReplaceState = window.history.replaceState.bind(window.history);
    window.history.replaceState = function (...args: any[]) {
      origReplaceState(...args);
      update();
    };
    return () => {
      window.removeEventListener("popstate", update);
      window.history.pushState = origPushState;
      window.history.replaceState = origReplaceState;
    };
  }, []);
  return pathname;
}

const CURRENT_RUNTIME =
  (typeof window !== "undefined"
    ? (window as any).__TWN_RUNTIME_CONFIG__
    : null) || {
    siteBaseUrl: isFramerRuntimeHost()
      ? "https://maroon-aside-814100.framer.app"
      : "https://tripwithnomads.com",
    gatewayUrl: isFramerRuntimeHost()
      ? "https://twn-checkout-gateway-staging.tripwithnomads-crm.workers.dev"
      : "https://twn-checkout-gateway.tripwithnomads-crm.workers.dev",
  };

/**
 * fetchGateway: Secure proxy wrapper for API calls.
 * Mandates the use of the Cloudflare gateway to avoid direct Supabase exposure.
 */
function buildGatewayUrl(path: string, params?: URLSearchParams): string {
  const base = String(CURRENT_RUNTIME.gatewayUrl || "").trim().replace(
    /\/+$/,
    "",
  );
  const endpoint = String(path || "").trim().replace(/^\/+/, "");
  const query = params?.toString() || "";
  return `${base}/${endpoint}${query ? `?${query}` : ""}`;
}

function fetchGateway(
  path: string,
  init: RequestInit = {},
  params?: URLSearchParams,
): Promise<Response> {
  const url = buildGatewayUrl(path, params);
  return fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
}

const cache = new Map<string, { ts: number; data: any }>();
const inFlight = new Map<string, Promise<any | null>>();
const actionableFailureLogged = new Set<string>();

type TripCardStatus = "priced" | "sold_out" | "unavailable";
type TripCardFailureReason =
  | "none"
  | "no_future_pricing"
  | "trip_not_found"
  | "invalid_identifier"
  | "network";

type TripCardDisplayState = {
  status: TripCardStatus;
  failureReason: TripCardFailureReason;
  display_summary: {
    base_price: number;
    payable_price: number;
    save_amount: number;
    has_discount: boolean;
  };
  next_batch_date: string;
  __hasFuturePricing: boolean;
};

function toNumber(value: any): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function fmtINR(value: number): string {
  return "₹" + Math.round(toNumber(value)).toLocaleString("en-IN");
}

function formatNextBatchDate(value: any): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return "";

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
  }).format(new Date(parsed));
}

function normalizeSlug(value: any): string {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  const fromUrl = raw.match(/\/upcoming-trips\/([^/?#]+)/i);
  const candidate = fromUrl?.[1] ? decodeURIComponent(fromUrl[1]) : raw;
  if (candidate.startsWith("framer-")) return "";
  if (UUID_REGEX.test(candidate)) return "";
  // Reject purely numeric values (e.g. price text placeholders like "0")
  if (/^\d+$/.test(candidate)) return "";
  // Must match slug format: lowercase alphanumeric segments joined by hyphens
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(candidate)) return "";
  // Real trip slugs ALWAYS contain at least one hyphen (e.g. "winter-spiti-expedition").
  // Single words like "inter" (font), "top" (CSS), "normal", "flex" are never trip slugs.
  // Only allow single-word slugs if they came from a /upcoming-trips/ URL path.
  if (!candidate.includes("-") && !fromUrl) return "";
  return candidate;
}

function normalizeTripId(value: any): string {
  const clean = String(value || "").trim();
  if (!UUID_REGEX.test(clean)) {
    return "";
  }
  return clean;
}

function readTripIdFromHrefLike(value: any): string {
  const raw = String(value || "").trim();
  if (!raw) return "";

  try {
    const url = new URL(raw, "https://tripwithnomads.com");
    return normalizeTripId(url.searchParams.get("tripId") || url.searchParams.get("trip_id") || "");
  } catch {
    const match = raw.match(/[?&](?:tripId|trip_id)=([0-9a-f-]{36})/i);
    return normalizeTripId(match?.[1] || "");
  }
}

// Keys to skip during deep scanning — these contain style/layout/font data, not CMS trip identifiers
const DEEP_SCAN_SKIP_KEYS = new Set([
  "style", "className", "font", "fonts", "fontFamily", "fontWeight", "fontSize",
  "fontStyle", "lineHeight", "letterSpacing", "color", "background",
  "backgroundColor", "border", "borderRadius", "padding", "margin",
  "width", "height", "top", "left", "right", "bottom", "position",
  "display", "overflow", "opacity", "transform", "transition", "animation",
  "boxShadow", "textDecoration", "textAlign", "verticalAlign", "whiteSpace",
  "zIndex", "cursor", "pointerEvents", "userSelect", "gap", "flex",
  "flexDirection", "alignItems", "justifyContent", "gridTemplate",
  "children", "key", "ref", "dangerouslySetInnerHTML",
  "__css", "__styles", "__styleSelectors",
  "inlineTextStyle", "textContent",
]);

/**
 * findSlugInCmsProps: Deeply scans the entire props object for CMS prop keys
 * (like awOOt0Clm) and returns the first value that looks like a valid trip slug.
 * This handles the case where Framer passes the trip SLUG (not UUID) as a CMS prop
 * to child text layers inside a card.
 */
function findSlugInCmsProps(value: any, depth = 0): string {
  if (depth > 3 || value == null) return "";
  if (typeof value === "string" || typeof value === "number") {
    const raw = String(value).trim().toLowerCase();
    const slug = normalizeSlug(raw);
    if (slug && !UUID_REGEX.test(raw)) return slug;
    return "";
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findSlugInCmsProps(item, depth + 1);
      if (found) return found;
    }
    return "";
  }
  if (typeof value === "object") {
    // Priority: check known CMS keys first
    for (const key of TRIP_ID_PROP_KEYS) {
      const found = findSlugInCmsProps((value as any)?.[key], depth + 1);
      if (found) return found;
    }
    // Then scan remaining keys, but skip known non-CMS keys
    for (const key of Object.keys(value as any)) {
      if (DEEP_SCAN_SKIP_KEYS.has(key)) continue;
      const found = findSlugInCmsProps((value as any)[key], depth + 1);
      if (found) return found;
    }
  }
  return "";
}

/**
 * findTripIdInValue: Deeply scans the entire props object for UUID v4 strings.
 * Framer's internal component system may pass CMS item IDs (trip_uuid) deeply
 * nested in a child component's props without exposing them via href or direct keys.
 */
function findTripIdInValue(value: any, depth = 0): string {
  if (depth > 3 || value == null) return "";
  if (typeof value === "string" || typeof value === "number") {
    const raw = String(value);
    const direct = normalizeTripId(raw);
    if (direct) return direct;
    const matches = raw.match(UUID_GLOBAL_REGEX);
    return normalizeTripId(matches?.[0] || "");
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findTripIdInValue(item, depth + 1);
      if (found) return found;
    }
    return "";
  }
  if (typeof value === "object") {
    for (const key of TRIP_ID_PROP_KEYS) {
      const found = findTripIdInValue((value as any)?.[key], depth + 1);
      if (found) return found;
    }
    for (const key of Object.keys(value as any)) {
      if (DEEP_SCAN_SKIP_KEYS.has(key)) continue;
      const found = findTripIdInValue((value as any)[key], depth + 1);
      if (found) return found;
    }
  }
  return "";
}

function createEmptySummary() {
  return {
    base_price: 0,
    payable_price: 0,
    save_amount: 0,
    has_discount: false,
  };
}

function createTripCardState(
  status: TripCardStatus,
  failureReason: TripCardFailureReason,
  summary?: Partial<TripCardDisplayState["display_summary"]> | null,
  nextBatchDate?: string,
): TripCardDisplayState {
  return {
    status,
    failureReason,
    display_summary: {
      ...createEmptySummary(),
      ...(summary || {}),
    },
    next_batch_date: String(nextBatchDate || "").trim(),
    __hasFuturePricing: status === "priced",
  };
}

function createSoldOutData(reason: TripCardFailureReason = "no_future_pricing") {
  return createTripCardState("sold_out", reason);
}

function createUnavailableData(
  reason: TripCardFailureReason = "network",
): TripCardDisplayState {
  return createTripCardState("unavailable", reason);
}

function isPricedData(data: any): boolean {
  return data?.status === "priced";
}

function normalizeFailureReasonFromResponse(
  status: number,
  rawMessage: string,
): TripCardFailureReason {
  const message = String(rawMessage || "").toLowerCase();
  if (message.includes("no future pricing found")) return "no_future_pricing";
  if (message.includes("trip not found")) return "trip_not_found";
  if (
    message.includes("invalid") ||
    message.includes("required") ||
    message.includes("missing")
  ) {
    return "invalid_identifier";
  }
  if (status === 404) return "trip_not_found";
  if (status === 400 || status === 422) return "invalid_identifier";
  return "network";
}

async function readFailureReasonFromResponse(
  response: Response,
): Promise<TripCardFailureReason> {
  const payload = await response.json().catch(() => ({}));
  return normalizeFailureReasonFromResponse(
    response.status,
    String(payload?.error || payload?.message || ""),
  );
}

function logActionableFailureOnce(
  cacheKey: string,
  reason: TripCardFailureReason,
): void {
  if (
    reason !== "trip_not_found" &&
    reason !== "invalid_identifier" &&
    reason !== "network"
  ) {
    return;
  }
  const logKey = `${cacheKey}:${reason}`;
  if (actionableFailureLogged.has(logKey)) return;
  actionableFailureLogged.add(logKey);
  if (isFramerRuntimeHost()) {
    console.info("[TripPriceOverrides] Unavailable trip pricing", {
      key: cacheKey,
      reason,
    });
  }
}

function buildDisplayDataFromCheckoutContext(payload: any): any | null {
  const rows = Array.isArray(payload?.pricing_rows)
    ? payload.pricing_rows
    : Array.isArray(payload?.pricing)
    ? payload.pricing
    : [];
  if (rows.length === 0) return createSoldOutData("no_future_pricing");

  const prices = rows
    .map((row) =>
      toNumber(row?.price || row?.payable_price || row?.base_price || row?.amount)
    )
    .filter((value) => value > 0);

  if (prices.length === 0) return createSoldOutData("no_future_pricing");
  const lowest = Math.min(...prices);

  const startDates = rows
    .map((row) => String(row?.start_date || row?.departure_date || "").trim())
    .filter(Boolean);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayTs = today.getTime();
  const upcomingDates = startDates
    .filter((value) => {
      const parsed = Date.parse(value);
      return Number.isFinite(parsed) && parsed >= todayTs;
    })
    .sort();

  if (upcomingDates.length === 0) {
    return createSoldOutData("no_future_pricing");
  }

  return createTripCardState(
    "priced",
    "none",
    {
      base_price: lowest,
      payable_price: lowest,
      save_amount: 0,
      has_discount: false,
    },
    upcomingDates[0],
  );
}

async function fetchDisplayFallbackFromContext(
  params: { slug?: string; tripId?: string },
): Promise<{
  data: TripCardDisplayState | null;
  failureReason: TripCardFailureReason;
}> {
  const query = new URLSearchParams();
  const slug = normalizeSlug(params.slug);
  const tripId = normalizeTripId(params.tripId);
  if (slug) query.set("slug", slug);
  if (tripId) query.set("trip_id", tripId);
  if (!slug && !tripId) {
    return { data: null, failureReason: "invalid_identifier" };
  }

  // Pass the current page URL so the Cloudflare Worker can extract the
  // trip slug when a trip_id lookup fails (since cross-origin Referer
  // only sends origin, not the full path).
  if (tripId && typeof window !== "undefined") {
    query.set("page_url", window.location.href);
  }

  try {
    const response = await fetchGateway(
      "get-trip-checkout-context",
      { method: "GET" },
      query,
    );
    if (!response.ok) {
      return {
        data: null,
        failureReason: await readFailureReasonFromResponse(response),
      };
    }
    const payload = await response.json().catch(() => null);
    const data = buildDisplayDataFromCheckoutContext(payload);
    if (!data) {
      return { data: createSoldOutData("no_future_pricing"), failureReason: "none" };
    }
    return { data, failureReason: "none" };
  } catch (_error) {
    return { data: null, failureReason: "network" };
  }
}

function readTripIdCandidate(props: any): string {
  // Priority: static data-trip-id attribute (most reliable, not affected by ?slug=),
  // then explicit props, then CMS internal key, then href/link, then deep scan.
  const direct = normalizeTripId(
    props?.["data-trip-id"] ||
      props?.tripId ||
      props?.trip_id ||
      props?.tripid ||
      props?.awOOt0Clm,
  );
  if (direct) return direct;

  const hrefCandidates = [
    props?.href,
    props?.link,
    props?.link?.href,
    props?.link?.url,
    props?.link?.path,
  ];
  for (const candidate of hrefCandidates) {
    const fromHref = readTripIdFromHrefLike(candidate);
    if (fromHref) return fromHref;
  }

  return findTripIdInValue(props);
}

function readSlugFromUrl(): string {
  if (typeof window === "undefined") return "";
  // Pass the full pathname so normalizeSlug's internal /upcoming-trips/ regex
  // can detect URL origin and allow single-word slugs via the fromUrl exception.
  return normalizeSlug(window.location.pathname);
}

function readTripSlugCandidate(props: any): string {
  const direct = normalizeSlug(
    props?.slug || props?.["data-trip-slug"],
  );
  if (direct) return direct;

  const href = String(props?.href || "").trim();
  const hrefMatch = href.match(/\/upcoming-trips\/([^/?#]+)/i);
  if (hrefMatch?.[1]) return normalizeSlug(hrefMatch[1]);

  const linkCandidates = [
    props?.link,
    props?.link?.href,
    props?.link?.url,
    props?.link?.path,
  ];
  for (const candidate of linkCandidates) {
    const link = String(candidate || "").trim();
    const linkMatch = link.match(/\/upcoming-trips\/([^/?#]+)/i);
    if (linkMatch?.[1]) return normalizeSlug(linkMatch[1]);
  }

  return findSlugInCmsProps(props);
}

export function withTripIdSource(Component): ComponentType {
  return (props: any) => {
    const nextTripId = readTripIdCandidate(props);

    useEffect(() => {
      if (nextTripId && typeof window !== "undefined") {
        _forcedTripId = nextTripId;
        window.dispatchEvent(
          new CustomEvent(TRIP_ID_SOURCE_EVENT, { detail: nextTripId }),
        );
      }
    }, [nextTripId]);

    return <Component {...props} />;
  };
}

function fetchTripDisplayPrice(
  params: { slug?: string; tripId?: string },
): Promise<any | null> {
  const rawSlug = String(params.slug || "").trim();
  const rawTripId = String(params.tripId || "").trim();
  const fallbackSlug = normalizeSlug(rawSlug);
  const tripId = normalizeTripId(rawTripId);
  const activeTripId = tripId;
  const activeSlug = activeTripId ? "" : fallbackSlug;
  if (!activeSlug && !activeTripId) {
    return Promise.resolve(createUnavailableData("invalid_identifier"));
  }

  const cacheKey = `${activeSlug}::${activeTripId}::${fallbackSlug}`;
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && now - cached.ts < 120000) return Promise.resolve(cached.data);
  const pending = inFlight.get(cacheKey);
  if (pending) return pending;

  const request = (async (): Promise<TripCardDisplayState> => {
    const primaryResult = await fetchDisplayFallbackFromContext({
      slug: activeSlug,
      tripId: activeTripId,
    });
    const primaryData = primaryResult.data;

    if (primaryData) {
      cache.set(cacheKey, { ts: Date.now(), data: primaryData });
      return primaryData;
    }

    if (
      primaryResult.failureReason === "trip_not_found" ||
      primaryResult.failureReason === "invalid_identifier"
    ) {
      // Trip ID failed — try slug fallback before giving up.
      // This handles stale/orphaned trip IDs in Framer CMS props
      // (e.g. a deleted trip's UUID stuck in CMS metadata).
      const urlSlug = fallbackSlug || readSlugFromUrl();
      if (urlSlug && activeTripId) {
        const slugResult = await fetchDisplayFallbackFromContext({
          slug: urlSlug,
          tripId: "",
        });
        if (slugResult.data) {
          cache.set(cacheKey, { ts: Date.now(), data: slugResult.data });
          return slugResult.data;
        }
      }
      const unavailable = createUnavailableData(primaryResult.failureReason);
      logActionableFailureOnce(cacheKey, primaryResult.failureReason);
      cache.set(cacheKey, { ts: Date.now(), data: unavailable });
      return unavailable;
    }

    const unavailable = createUnavailableData("network");
    logActionableFailureOnce(cacheKey, "network");
    cache.set(cacheKey, { ts: Date.now(), data: unavailable });
    return unavailable;
  })().finally(() => {
    inFlight.delete(cacheKey);
  });

  inFlight.set(cacheKey, request);
  return request;
}

function useTripDisplayData(props: any): any | null {
  const [data, setData] = useState<any | null>(null);
  const isHydrated = useHydrated();
  const [forcedTripId, setForcedTripId] = useState<string>(() =>
    normalizeTripId(_forcedTripId),
  );
  const [forcedSlug, setForcedSlug] = useState<string>("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = (event?: Event) => {
      const detail = (event as CustomEvent)?.detail;
      const fromEventTripId = typeof detail === "object" ? detail?.tripId : detail;
      const fromEventSlug = typeof detail === "object" ? detail?.slug : "";
      
      const nextTripId = normalizeTripId(fromEventTripId) || normalizeTripId(_forcedTripId);
      setForcedTripId((prev) => (prev === nextTripId ? prev : nextTripId));
      
      const nextSlug = normalizeSlug(fromEventSlug);
      setForcedSlug((prev) => (prev === nextSlug ? prev : nextSlug));
    };
    window.addEventListener(TRIP_ID_SOURCE_EVENT, sync as EventListener);
    sync();
    return () => {
      window.removeEventListener(TRIP_ID_SOURCE_EVENT, sync as EventListener);
    };
  }, []);

  const slug = useMemo(() => {
    if (!isHydrated) return "";

    const propsSlug = readTripSlugCandidate(props);
    if (propsSlug) return propsSlug;

    if (forcedSlug) return forcedSlug;

    // Main pricing on detail page — use forcedTripId from hidden source.
    // If the hidden source hasn't broadcast yet, return empty and let the
    // tripId-driven fetch take over when forcedTripId arrives.
    return "";
  }, [props, isHydrated, forcedSlug]);

  const tripId = useMemo(() => {
    if (!isHydrated) return "";

    // Check if this component has its own trip ID in props.
    const propsTripId = readTripIdCandidate(props);
    if (propsTripId) return propsTripId;

    // Main pricing on detail page — use forced trip ID from hidden source if available.
    if (forcedTripId) return forcedTripId;

    return "";
  }, [props, isHydrated, forcedTripId]);

  useEffect(() => {
    if (!slug && !tripId) {
      setData(createUnavailableData("invalid_identifier"));
      return;
    }
    fetchTripDisplayPrice({ slug, tripId }).then((res) => {
      setData(res || createUnavailableData("network"));
    });
  }, [slug, tripId]);

  return data;
}

/**
 * withTripPriceText: Base override for price-related text.
 */
function withTripPriceText(
  getValue: (data: any) => string,
  fallback = "\u2014",
) {
  return function (Component: ComponentType): ComponentType {
    return (props: any) => {
      const data = useTripDisplayData(props);
      const isHydrated = useHydrated();
      if (!isHydrated) {
        return <Component {...props} text="" visible={false} />;
      }
      // ALWAYS use the fallback when API data is unavailable.
      // DO NOT fall through to props?.text — that contains CMS-bound values
      // that may show raw trip UUIDs instead of a placeholder.
      const fetchedText = getValue(data);
      const text =
        data && isPricedData(data) && fetchedText
          ? fetchedText
          : fallback;
      return <Component {...props} text={text} />;
    };
  };
}

export function withTripPrimaryPrice(Component): ComponentType {
  return withTripPriceText((data) => {
    if (!isPricedData(data)) return "";
    const value = toNumber(data?.display_summary?.payable_price);
    return value > 0 ? fmtINR(value) : "";
  }, "")(Component);
}

export function withTripStrikePrice(Component): ComponentType {
  return (props: any) => {
    const tripData = useTripDisplayData(props);
    const isHydrated = useHydrated();
    const summary = tripData?.display_summary;
    const base = toNumber(summary?.base_price);
    const payable = toNumber(summary?.payable_price);
    const hasDiscount = isHydrated && Boolean(summary?.has_discount) &&
      base > payable && payable > 0;

    if (!hasDiscount) {
      return <Component {...props} text="" visible={false} />;
    }
    const text = fmtINR(base);
    return (
      <Component
        {...props}
        text={text}
        visible={true}
        style={{
          ...(props.style || {}),
          textDecorationLine: "line-through",
          textDecoration: "line-through",
        }}
      />
    );
  };
}

export function withTripSaveBadge(Component): ComponentType {
  return (props: any) => {
    const tripData = useTripDisplayData(props);
    const isHydrated = useHydrated();
    const summary = tripData?.display_summary;
    const save = toNumber(summary?.save_amount);
    const hasDiscount = isHydrated && Boolean(summary?.has_discount) &&
      save > 0;

    if (!hasDiscount) {
      return (
        <Component
          {...props}
          text=""
          style={{
            ...(props.style || {}),
            display: "none",
            pointerEvents: "none",
          }}
        />
      );
    }
    const text = `Save ${fmtINR(save)}`;
    return <Component {...props} text={text} visible={true} />;
  };
}

export function withTripHideWhenNoDiscount(Component): ComponentType {
  return (props: any) => {
    const tripData = useTripDisplayData(props);
    const isHydrated = useHydrated();
    const summary = tripData?.display_summary;
    const hasDiscount = isHydrated && Boolean(summary?.has_discount) &&
      toNumber(summary?.save_amount) > 0;

    if (!hasDiscount) {
      return (
        <Component
          {...props}
          style={{
            ...(props.style || {}),
            display: "none",
            pointerEvents: "none",
          }}
        />
      );
    }
    return <Component {...props} />;
  };
}

export function withTripStartsFromText(Component): ComponentType {
  return (props: any) => {
    const tripData = useTripDisplayData(props);
    if (!isPricedData(tripData)) {
      return (
        <Component
          {...props}
          text=""
          style={{
            ...(props.style || {}),
            display: "none",
            pointerEvents: "none",
          }}
        />
      );
    }
    return <Component {...props} text="Starts from" />;
  };
}

export function withTripNextBatchText(Component): ComponentType {
  return (props: any) => {
    const isHydrated = useHydrated();
    const tripData = useTripDisplayData(props);
    if (tripData?.status === "sold_out") {
      return <Component {...props} text="" visible={false} />;
    }
    if (tripData?.status === "unavailable") {
      // API failed — hide instead of leaking CMS text (e.g. trip UUID)
      return <Component {...props} text="" visible={false} />;
    }
    const nextBatchLabel = isHydrated
      ? formatNextBatchDate(tripData?.next_batch_date)
      : "";

    if (!nextBatchLabel) {
      return <Component {...props} text="" visible={false} />;
    }

    const text = `Next batch - ${nextBatchLabel}`;
    return <Component {...props} text={text} visible={true} />;
  };
}
