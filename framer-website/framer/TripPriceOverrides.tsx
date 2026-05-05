import React from "react";
import type { ComponentType } from "react";

const { useEffect, useState, useMemo } = React;

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
    siteBaseUrl: (typeof window !== "undefined" &&
        (window.location.hostname.includes("framer.app") ||
          window.location.hostname.includes("framer.website")))
      ? "https://maroon-aside-814100.framer.app"
      : "https://tripwithnomads.com",
    gatewayUrl: (typeof window !== "undefined" &&
        (window.location.hostname.includes("framer.app") ||
          window.location.hostname.includes("framer.website")))
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
let forcedTripId = "";

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

function getTripSlugFromPathname(pathname: string): string {
  const clean = String(pathname || "");
  const match = clean.match(/\/upcoming-trips\/([^/?#]+)/i);
  return match?.[1] ? decodeURIComponent(match[1]) : "";
}

function normalizeSlug(value: any): string {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";

  const fromUrl = raw.match(/\/upcoming-trips\/([^/?#]+)/i);
  const candidate = fromUrl?.[1] ? decodeURIComponent(fromUrl[1]) : raw;
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(candidate) ? candidate : "";
}

function normalizeTripId(value: any): string {
  const clean = String(value || "").trim();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(clean)
  ) {
    return "";
  }
  return clean;
}

function readTripIdCandidate(props: any): string {
  return normalizeTripId(
    props?.tripId ||
      props?.["data-trip-id"] ||
      props?.text ||
      (typeof props?.children === "string" ? props.children : ""),
  );
}

function readTripSlugCandidate(props: any): string {
  return normalizeSlug(
    props?.slug ||
      props?.["data-trip-slug"] ||
      props?.href ||
      props?.link ||
      props?.text ||
      (typeof props?.children === "string" ? props.children : ""),
  );
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
  const slug = String(params.slug || "").trim();
  const tripId = String(params.tripId || "").trim();
  if (!slug && !tripId) return Promise.resolve(null);

  const cacheKey = `${slug}::${tripId}`;
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && now - cached.ts < 120000) return Promise.resolve(cached.data);
  const pending = inFlight.get(cacheKey);
  if (pending) return pending;

  const query = new URLSearchParams();
  if (slug) query.set("slug", slug);
  if (tripId) query.set("trip_id", tripId);
  query.set("v", "3");

  const request = fetchGateway(
    "get-trip-display-price",
    { method: "GET" },
    query,
  )
    .then((res) => {
      if (!res.ok) return null;
      return res.json().then((data) => {
        if (data) cache.set(cacheKey, { ts: Date.now(), data });
        return data;
      }).catch(() => null);
    })
    .catch(() => null)
    .finally(() => {
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
    if (!slug && !activeTripId) return;
    fetchTripDisplayPrice({ slug, tripId: activeTripId }).then((res) => {
      if (res) setData(res);
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
    const value = toNumber(data?.display_summary?.payable_price);
    return value > 0 ? fmtINR(value) : "₹0";
  }, "₹0")(Component);
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
    return <Component {...props} text="Starts from" />;
  };
}

export function withTripNextBatchText(Component): ComponentType {
  return (props: any) => {
    const tripData = useTripDisplayData(props);
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
