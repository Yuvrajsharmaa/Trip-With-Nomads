import React from "react";
import type { ComponentType } from "react";

const { useEffect, useState, useMemo } = React;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_GLOBAL_REGEX =
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/ig;
const TRIP_ID_PROP_KEYS = [
  "tripId",
  "trip_id",
  "tripid",
  "awOOt0Clm",
];

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
let forcedTripId = "";

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
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(candidate) ? candidate : "";
}

function normalizeTripId(value: any): string {
  const clean = String(value || "").trim();
  if (!UUID_REGEX.test(clean)) {
    return "";
  }
  return clean;
}

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
  console.info("[TripPriceOverrides] Unavailable trip pricing", {
    key: cacheKey,
    reason,
  });
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
  const direct = normalizeTripId(
    props?.tripId ||
      props?.trip_id ||
      props?.tripid ||
      props?.awOOt0Clm ||
      props?.["data-trip-id"] ||
      props?.text ||
      (typeof props?.children === "string" ? props.children : ""),
  );
  return direct || findTripIdInValue(props);
}

function readTripSlugCandidate(props: any): string {
  const direct = normalizeSlug(props?.slug || props?.["data-trip-slug"]);
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

  return "";
}

export function withTripIdSource(Component): ComponentType {
  return (props: any) => {
    const nextTripId = readTripIdCandidate(props);

    useEffect(() => {
      if (nextTripId) {
        forcedTripId = nextTripId;
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
  const slug = normalizeSlug(rawSlug);
  const tripId = normalizeTripId(rawTripId) || normalizeTripId(rawSlug);
  const activeTripId = tripId;
  const activeSlug = activeTripId ? "" : slug;
  if (!activeSlug && !activeTripId) {
    return Promise.resolve(createUnavailableData("invalid_identifier"));
  }

  const cacheKey = `${activeSlug}::${activeTripId}`;
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && now - cached.ts < 120000) return Promise.resolve(cached.data);
  const pending = inFlight.get(cacheKey);
  if (pending) return pending;

  const query = new URLSearchParams();
  if (activeSlug) query.set("slug", activeSlug);
  if (activeTripId) query.set("trip_id", activeTripId);
  query.set("v", "3");

  const request = (async (): Promise<TripCardDisplayState> => {
    const contextResult = await fetchDisplayFallbackFromContext({
      slug: activeSlug,
      tripId: activeTripId,
    });
    const contextData = contextResult.data;

    if (contextData?.status === "sold_out") {
      cache.set(cacheKey, { ts: Date.now(), data: contextData });
      return contextData;
    }

    if (
      contextResult.failureReason === "trip_not_found" ||
      contextResult.failureReason === "invalid_identifier"
    ) {
      const unavailable = createUnavailableData(contextResult.failureReason);
      logActionableFailureOnce(cacheKey, contextResult.failureReason);
      cache.set(cacheKey, { ts: Date.now(), data: unavailable });
      return unavailable;
    }

    try {
      const response = await fetchGateway(
        "get-trip-display-price",
        { method: "GET" },
        query,
      );
      if (!response.ok) {
        const reason = await readFailureReasonFromResponse(response);
        if (reason === "no_future_pricing") {
          const soldOut = createSoldOutData("no_future_pricing");
          cache.set(cacheKey, { ts: Date.now(), data: soldOut });
          return soldOut;
        }
        if (contextData?.status === "priced") {
          cache.set(cacheKey, { ts: Date.now(), data: contextData });
          return contextData;
        }
        const unavailable = createUnavailableData(reason);
        logActionableFailureOnce(cacheKey, reason);
        cache.set(cacheKey, { ts: Date.now(), data: unavailable });
        return unavailable;
      }

      const payload = await response.json().catch(() => null);
      const payable = toNumber(payload?.display_summary?.payable_price);
      if (payable > 0) {
        const pricedData = createTripCardState(
          "priced",
          "none",
          {
            base_price: toNumber(payload?.display_summary?.base_price),
            payable_price: payable,
            save_amount: toNumber(payload?.display_summary?.save_amount),
            has_discount: Boolean(payload?.display_summary?.has_discount),
          },
          String(payload?.next_batch_date || contextData?.next_batch_date || ""),
        );
        cache.set(cacheKey, { ts: Date.now(), data: pricedData });
        return pricedData;
      }

      if (contextData?.status === "priced") {
        cache.set(cacheKey, { ts: Date.now(), data: contextData });
        return contextData;
      }

      const soldOut = createSoldOutData("no_future_pricing");
      cache.set(cacheKey, { ts: Date.now(), data: soldOut });
      return soldOut;
    } catch (_error) {
      if (contextData?.status === "priced") {
        cache.set(cacheKey, { ts: Date.now(), data: contextData });
        return contextData;
      }
      const unavailable = createUnavailableData("network");
      logActionableFailureOnce(cacheKey, "network");
      cache.set(cacheKey, { ts: Date.now(), data: unavailable });
      return unavailable;
    }
  })().finally(() => {
    inFlight.delete(cacheKey);
  });

  inFlight.set(cacheKey, request);
  return request;
}

function useTripDisplayData(props: any): any | null {
  const [data, setData] = useState<any | null>(null);
  const slug = useMemo(() => readTripSlugCandidate(props), [props]);
  const tripId = useMemo(() => readTripIdCandidate(props), [props]);
  const activeTripId = tripId || forcedTripId;

  useEffect(() => {
    if (!slug && !activeTripId) {
      setData(createUnavailableData("invalid_identifier"));
      return;
    }
    fetchTripDisplayPrice({ slug, tripId: activeTripId }).then((res) => {
      setData(res || createUnavailableData("network"));
    });
  }, [slug, activeTripId]);

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
      const text = isHydrated ? (getValue(data) || fallback) : fallback;
      return <Component {...props} text={text} />;
    };
  };
}

export function withTripPrimaryPrice(Component): ComponentType {
  return withTripPriceText((data) => {
    if (!isPricedData(data)) return "Price on demand";
    const value = toNumber(data?.display_summary?.payable_price);
    return value > 0 ? fmtINR(value) : "Price on demand";
  }, "Price on demand")(Component);
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
    const tripData = useTripDisplayData(props);
    if (tripData?.status === "sold_out") {
      return <Component {...props} text="No upcoming batches" visible={true} />;
    }
    if (tripData?.status === "unavailable") {
      return <Component {...props} text="" visible={false} />;
    }
    const isHydrated = useHydrated();
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
