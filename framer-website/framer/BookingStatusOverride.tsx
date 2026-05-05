import type { ComponentType } from "react";
import React from "react";

const { useEffect, useRef, useState, useMemo } = React;

/**
 * useHydrated: A helper hook to prevent React hydration mismatches (#418).
 * Ensures that components render the same content on server and first client pass.
 */
function useHydrated() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}

// ─────────────────────────────────────────────────────────────
// Booking Status Override — UNIFIED SUCCESS / FAILURE PAGE
//
// HOW IT WORKS:
//   1. handle-payment Edge Function redirects BOTH success
//      and failure to:
//         /payment-success?booking_id=<UUID> or
//         /payment-failed?booking_id=<UUID>
//   2. withBookingStatus reads `booking_id` from URL.
//   3. Fetches the full booking row from Supabase.
//   4. All overrides adapt based on `payment_status`.
//
// ─────────────────────────────────────────────────────────────

/**
 * CURRENT_RUNTIME: Dynamic configuration based on the environment.
 * Ensures the app knows whether to route to staging or production gateways.
 */
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

const GATEWAY_URL = CURRENT_RUNTIME.gatewayUrl;
const DOMESTIC_TRIPS_BASE_URL = `${CURRENT_RUNTIME.siteBaseUrl}/domestic-trips`;

/**
 * fetchGateway: Secure proxy wrapper for API calls.
 * routes requests through Cloudflare Workers to avoid exposing Supabase secrets.
 */
function buildGatewayUrl(path: string, params?: URLSearchParams): string {
  const base = String(GATEWAY_URL || "").trim().replace(/\/+$/, "");
  const gatewayPath = path.replace(/^\/+/, "");
  const query = params?.toString() || "";
  return `${base}/${gatewayPath}${query ? `?${query}` : ""}`;
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

// ─── TYPES ───────────────────────────────────────────────────

interface BookingData {
  id: string;
  trip_id: string;
  departure_date: string;
  transport?: string;
  travellers: Array<
    { name: string; sharing: string; transport?: string; vehicle?: string }
  >;
  payment_breakdown: Array<
    { label: string; price: number; variant?: string; count?: number }
  >;
  subtotal_amount?: number;
  discount_amount?: number;
  coupon_code?: string | null;
  coupon_snapshot?: any;
  tax_amount: number;
  total_amount: number;
  currency: string;
  payment_status: "pending" | "paid" | "failed";
  payment_mode?: "full" | "partial_25";
  payable_now_amount?: number;
  paid_amount?: number;
  due_amount?: number;
  settlement_status?: "pending" | "failed" | "partially_paid" | "fully_paid";
  balance_due_note?: string | null;
  payu_txnid: string;
  name: string;
  email: string;
  phone: string;
  created_at: string;
  // Populated from trips table join
  trip_title?: string;
}

type LoadState = "loading" | "ready" | "error";

// ─── SHARED STATE ────────────────────────────────────────────
// All overrides on the page share one booking object.
// withBookingStatus fills it; every other override reads it.

let _data: BookingData | null = null;
let _state: LoadState = "loading";
let _subs: Array<() => void> = [];
let _pendingCountdown = 0;

function notify() {
  _subs.forEach((fn) => fn());
}

function useBooking(): [BookingData | null, LoadState] {
  const [, bump] = useState(0);
  useEffect(() => {
    const cb = () => bump((n) => n + 1);
    _subs.push(cb);
    return () => {
      _subs = _subs.filter((s) => s !== cb);
    };
  }, []);
  return [_data, _state];
}

// ─── HELPERS ─────────────────────────────────────────────────

function fmt(amount: number): string {
  return "₹" + Math.round(amount).toLocaleString("en-IN");
}

function toNumber(value: any): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function resolvedTotalAmount(d: BookingData): number {
  const explicit = Math.max(0, toNumber((d as any)?.total_amount));
  if (explicit > 0) return explicit;

  const fromPricingSnapshot = Math.max(
    0,
    toNumber((d as any)?.pricing_snapshot?.total_amount),
  );
  if (fromPricingSnapshot > 0) return fromPricingSnapshot;

  const fromPricingSummary = Math.max(
    0,
    toNumber((d as any)?.pricing_summary?.total_amount),
  );
  if (fromPricingSummary > 0) return fromPricingSummary;

  const fromBreakdownSummary = Math.max(
    0,
    toNumber((d as any)?.payment_breakdown_summary?.total_amount),
  );
  if (fromBreakdownSummary > 0) return fromBreakdownSummary;

  const fromDiscountedPlusTax = Math.max(
    0,
    discountedSubtotal(d) + toNumber(d?.tax_amount),
  );
  if (fromDiscountedPlusTax > 0) return fromDiscountedPlusTax;

  const fromAmount = Math.max(0, toNumber((d as any)?.amount));
  if (fromAmount > 0) return fromAmount;

  return 0;
}

function subtotalBeforeDiscount(d: BookingData): number {
  const explicit = toNumber((d as any).subtotal_amount);
  if (explicit > 0) return explicit;

  const fallbackDiscounted = toNumber(d.total_amount) - toNumber(d.tax_amount);
  const discount = Math.max(0, toNumber((d as any).discount_amount));
  return Math.max(0, fallbackDiscounted + discount);
}

function discountAmount(d: BookingData): number {
  return Math.max(0, toNumber((d as any).discount_amount));
}

function settlementStatus(
  d: BookingData,
): "pending" | "failed" | "partially_paid" | "fully_paid" {
  const explicit = String((d as any)?.settlement_status || "").trim()
    .toLowerCase();
  if (
    explicit === "pending" ||
    explicit === "failed" ||
    explicit === "partially_paid" ||
    explicit === "fully_paid"
  ) {
    return explicit as any;
  }
  if (d.payment_status === "failed") return "failed";
  if (d.payment_status === "paid") {
    const due = Math.max(0, toNumber((d as any)?.due_amount));
    const mode = String((d as any)?.payment_mode || "").trim().toLowerCase();
    if (mode === "partial_25" || due > 0) return "partially_paid";
    return "fully_paid";
  }
  return "pending";
}

function dueAmount(d: BookingData): number {
  const explicit = Math.max(0, toNumber((d as any)?.due_amount));
  if (explicit > 0) return explicit;
  const status = settlementStatus(d);
  if (status === "partially_paid") {
    const total = Math.max(0, toNumber(d.total_amount));
    const payableNow = Math.max(0, toNumber((d as any)?.payable_now_amount));
    if (payableNow > 0) return Math.max(0, total - payableNow);
  }
  return 0;
}

function paidAmount(d: BookingData): number {
  const explicit = Math.max(0, toNumber((d as any)?.paid_amount));
  if (explicit > 0) return explicit;
  const status = settlementStatus(d);
  if (status === "fully_paid") return resolvedTotalAmount(d);
  if (status === "partially_paid") {
    return Math.max(0, toNumber((d as any)?.payable_now_amount));
  }
  return 0;
}

function discountedSubtotal(d: BookingData): number {
  return Math.max(0, subtotalBeforeDiscount(d) - discountAmount(d));
}

function bookingRef(data: any): string {
  if (!data) return "#\u2014";
  if (data.booking_ref) return "#" + data.booking_ref;
  if (!data.id) return "#\u2014";
  // Fallback: Generate a clean reference from the UUID
  return "#TWN-" + data.id.replace(/-/g, "").slice(0, 8).toUpperCase();
}

function nodeText(node: any): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map((n) => nodeText(n)).join(" ");
  if (React.isValidElement(node)) {
    return nodeText((node as any).props?.children);
  }
  return "";
}

function normalizeSharingLabel(value: string): string {
  const clean = String(value || "").trim().replace(/\s+/g, " ");
  if (!clean) return "";
  if (/\bsharing\b/i.test(clean)) return clean;
  return `${clean} Sharing`;
}

function joinMetaParts(parts: Array<string | undefined | null>): string {
  return parts.map((part) => String(part || "").trim()).filter(Boolean).join(
    " \u00b7 ",
  );
}

function normalizeBookingId(value: string): string {
  const clean = String(value || "").trim();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(clean)
  ) {
    return clean; // Allow non-UUID if necessary, but backup logic had this check
  }
  return clean;
}

function buildStatusUrl(
  pathname: string,
  bookingId: string,
  statusToken?: string,
  extraParams?: Record<string, string>,
) {
  const base = CURRENT_RUNTIME.siteBaseUrl ||
    (typeof window !== "undefined" ? window.location.origin : "");
  const url = new URL(pathname, base.endsWith("/") ? base : `${base}/`);
  if (bookingId) url.searchParams.set("booking_id", bookingId);
  const token = String(statusToken || "").trim();
  if (token) url.searchParams.set("status_token", token);
  for (const [key, value] of Object.entries(extraParams || {})) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

// ═════════════════════════════════════════════════════════════
// 1. PAGE-LEVEL: withBookingStatus
//    Apply to the outermost frame. Fetches data once.
// ═════════════════════════════════════════════════════════════

export function withBookingStatus(Component): ComponentType {
  return (props: any) => {
    useEffect(() => {
      _data = null;
      _state = "loading";
      _pendingCountdown = 0;

      const fetchBooking = () => {
        const params = new URLSearchParams(window.location.search);
        const bookingId = normalizeBookingId(params.get("booking_id") || "");
        const statusToken = String(params.get("status_token") || "").trim();
        if (!bookingId) return Promise.resolve({ error: "No booking_id" });

        return fetchGateway("get-booking-status", {
          method: "POST",
          body: JSON.stringify({
            booking_id: bookingId,
            status_token: statusToken,
          }),
        })
          .then((statusRes) => {
            if (!statusRes.ok) return { error: "Not found" };
            return statusRes.json()
              .then((payload) => {
                if (payload?.booking) return { data: payload.booking };
                return { error: "Not found" };
              })
              .catch(() => ({ error: "Not found" }));
          })
          .catch((err) => ({ error: String(err) }));
      };

      const go = () => {
        const params = new URLSearchParams(window.location.search);
        const bookingId = normalizeBookingId(params.get("booking_id") || "");
        const statusToken = String(params.get("status_token") || "").trim();
        const isSuccessRoute = window.location.pathname.includes(
          "/payment-success",
        );
        const successUrl = buildStatusUrl(
          "/payment-success",
          bookingId,
          statusToken,
        );
        const failedUrl = buildStatusUrl(
          "/payment-failed",
          bookingId,
          statusToken,
          {
            reason: "pending-timeout",
          },
        );

        const maybeRedirectOnStatus = (status: string) => {
          if (status === "paid" && !isSuccessRoute) {
            window.location.href = successUrl;
            return true;
          }
          if (status === "failed" && isSuccessRoute) {
            window.location.href = failedUrl;
            return true;
          }
          return false;
        };

        // 1. Initial fetch
        fetchBooking().then((result) => {
          if (result.error) {
            console.warn("[BookingStatus]", result.error);
            _state = "error";
            notify();
            return;
          }

          _data = result.data;
          _state = "ready";
          notify();

          // 2. Poll if pending (max 15 times, 2s interval)
          if (_data && _data.payment_status === "pending") {
            console.log("[BookingStatus] Status is pending, starting poll...");
            let attempts = 0;
            const poll = () => {
              if (attempts >= 15) {
                // 3. Still pending after polling: show countdown
                let remaining = 8;
                const countdown = () => {
                  if (remaining <= 0) {
                    _pendingCountdown = 0;
                    notify();
                    if (_data?.payment_status === "pending" && bookingId) {
                      window.location.href = failedUrl;
                    }
                    return;
                  }
                  _pendingCountdown = remaining;
                  notify();
                  remaining--;

                  fetchBooking().then((recheck) => {
                    if (recheck?.data) {
                      const latest = recheck.data;
                      const latestStatus = latest.payment_status;
                      const changed = _data?.payment_status !== latestStatus;
                      _data = {
                        ...latest,
                        trip_title: latest.trip_title || _data?.trip_title,
                      };
                      notify();
                      if (changed && maybeRedirectOnStatus(latestStatus)) {
                        return;
                      }
                      if (latestStatus !== "pending") {
                        _pendingCountdown = 0;
                        notify();
                        return;
                      }
                    }
                    setTimeout(countdown, 1000);
                  });
                };
                countdown();
                return;
              }

              setTimeout(() => {
                attempts++;
                fetchBooking().then((res) => {
                  if (res.data) {
                    const newStatus = res.data.payment_status;
                    if (_data && newStatus !== _data.payment_status) {
                      console.log("[BookingStatus] Status changed:", newStatus);
                      _data = res.data;
                      notify();
                      if (maybeRedirectOnStatus(newStatus)) return;
                    }
                    if (newStatus === "pending") {
                      poll();
                    }
                  } else {
                    poll();
                  }
                });
              }, 2000);
            };
            poll();
          }
        });
      };

      go();
    }, []);

    return <Component {...props} />;
  };
}

// ALIAS for the status override as requested by the user
export function bookingsoveride(Component): ComponentType {
  return withBookingStatus(Component);
}

// ═════════════════════════════════════════════════════════════
// 2. TEXT OVERRIDES
//    Each finds the first text element inside the Framer
//    component and replaces its textContent.
// ═════════════════════════════════════════════════════════════

function textOverride(getter: (d: BookingData) => string, fallback = "\u2014") {
  return function (Component: ComponentType): ComponentType {
    return (props: any) => {
      const [data, state] = useBooking();
      const isHydrated = useHydrated();

      // If we are still loading, we can optionally return a placeholder
      // But usually, we want the template text to stay until ready.
      const text = useMemo(() => {
        if (!isHydrated) return fallback;
        if (state === "ready" && data) return getter(data);
        return fallback;
      }, [isHydrated, state, data]);

      return <Component {...props} text={text} />;
    };
  };
}

// --- BOOKING DETAILS CARD ---

export function withBookingId(Component): ComponentType {
  return textOverride((d) => bookingRef(d))(Component);
}

export function withTripName(Component): ComponentType {
  return textOverride((d) => d.trip_title || "\u2014")(Component);
}

export function withDepartureDate(Component): ComponentType {
  return textOverride((d) => d.departure_date || "\u2014")(Component);
}
export function withTransportOption(Component): ComponentType {
  return textOverride((d) => (d.transport ? d.transport : "Seat in Coach"))(
    Component,
  );
}

// --- TRAVELLER COUNT BADGE ---

export function withTravellerCount(Component): ComponentType {
  return textOverride((d) => {
    const n = d.travellers?.length || 0;
    return `${n} Traveller${n !== 1 ? "s" : ""}`;
  })(Component);
}

// --- PAYMENT SUMMARY CARD ---

export function withBasePrice(Component): ComponentType {
  return textOverride((d) => fmt(subtotalBeforeDiscount(d)))(Component);
}

export function withSubtotal(Component): ComponentType {
  return textOverride((d) => fmt(discountedSubtotal(d)))(Component);
}

export function withSubtotalBeforeDiscount(Component): ComponentType {
  return textOverride((d) => fmt(subtotalBeforeDiscount(d)))(Component);
}
export function withDiscountAmount(Component): ComponentType {
  return textOverride((d) => `- ${fmt(discountAmount(d))}`)(Component);
}

export function withCouponCode(Component): ComponentType {
  return textOverride((d) => {
    const code = (d as any).coupon_code;
    return code ? String(code).toUpperCase() : "";
  })(Component);
}

// Case-insensitive aliases for Framer compatibility
export function withdiscountamount(Component): ComponentType {
  return withDiscountAmount(Component);
}
export function withtransportoption(Component): ComponentType {
  return withTransportOption(Component);
}
export function withcouponcode(Component): ComponentType {
  return withCouponCode(Component);
}

export function withTaxAmount(Component): ComponentType {
  return textOverride((d) => fmt(d.tax_amount))(Component);
}

export function withTotalPaid(Component): ComponentType {
  return textOverride((d) => {
    const paid = paidAmount(d);
    if (paid > 0) return fmt(paid);
    const total = resolvedTotalAmount(d);
    return fmt(total);
  })(Component);
}

export function withPayableNowAmount(Component): ComponentType {
  return textOverride((d) =>
    fmt(Math.max(0, toNumber((d as any)?.payable_now_amount)))
  )(Component);
}

export function withDueAmount(Component): ComponentType {
  return textOverride((d) => fmt(dueAmount(d)))(Component);
}

export function withBalanceDueNote(Component): ComponentType {
  return textOverride((d) => {
    const due = dueAmount(d);
    if (due <= 0) return "";
    const explicit = String((d as any)?.balance_due_note || "").trim();
    return explicit || `${fmt(due)} due on-site before trip departure.`;
  })(Component);
}

// ═════════════════════════════════════════════════════════════
// 3. STATUS / PAYMENT BADGES
// ═════════════════════════════════════════════════════════════

export function withStatusBadge(Component): ComponentType {
  return textOverride(
    (d) => {
      const status = settlementStatus(d);
      if (status === "fully_paid") return "Confirmed";
      if (status === "partially_paid") return "Confirmed \u00b7 Balance Due";
      if (d.payment_status === "failed") return "Failed";
      return "Pending";
    },
    "Loading...",
  )(Component);
}

export function withPaymentBadge(Component): ComponentType {
  return textOverride(
    (d) => {
      const status = settlementStatus(d);
      if (status === "fully_paid") return "Paid in Full";
      if (status === "partially_paid") return "Partially Paid";
      if (d.payment_status === "failed") return "Failed";
      return "Pending";
    },
    "\u2026",
  )(Component);
}

// ═════════════════════════════════════════════════════════════
// 4. TRAVELLER LIST
// ═════════════════════════════════════════════════════════════

export function withTravellerList(Component): ComponentType {
  return (props: any) => {
    const [data, state] = useBooking();
    const travellers = data?.travellers || [];
    const rowRefs = useRef<Array<HTMLDivElement | null>>([]);
    const childrenArray = React.Children.toArray(props.children);
    const template = (childrenArray.find((child) => {
      if (!React.isValidElement(child)) return false;
      const text = nodeText((child as any).props?.children).toLowerCase();
      return text.includes("name") || text.includes("sharing") ||
        text.includes("email");
    }) as React.ReactElement | undefined) ||
      (childrenArray.find((child) => React.isValidElement(child)) as
        | React.ReactElement
        | undefined);

    useEffect(() => {
      if (state !== "ready" || !data || !template || travellers.length === 0) {
        return;
      }

      travellers.forEach((traveller, index) => {
        const row = rowRefs.current[index];
        if (!row) return;

        const textNodes = Array.from(
          row.querySelectorAll<HTMLElement>("p, span, h1, h2, h3, h4, h5, h6"),
        ).filter((el) => String(el.textContent || "").trim().length > 0);

        if (textNodes.length === 0) return;

        const name = String(traveller?.name || "").trim() ||
          `Traveller ${index + 1}`;
        const sharing = normalizeSharingLabel(String(traveller?.sharing || ""));
        const vehicle = String(traveller?.vehicle || traveller?.transport || "")
          .trim();
        const email = index === 0 ? String(data.email || "").trim() : "";
        const metaText = joinMetaParts([sharing, vehicle, email]);

        const nameNode = textNodes.find((el) =>
          /name/i.test(String(el.textContent || ""))
        ) || textNodes[0];
        const metaNode = textNodes.find((el) =>
          /sharing|email/i.test(String(el.textContent || ""))
        ) ||
          textNodes[1];

        if (nameNode) {
          nameNode.textContent = name;
        }
        if (metaNode) {
          metaNode.textContent = metaText;
          metaNode.style.whiteSpace = "normal";
          metaNode.style.overflowWrap = "anywhere";
          metaNode.style.wordBreak = "break-word";
        }

        // Remove any leftover placeholder nodes like "Sharing", "Email", bullets, etc.
        textNodes.forEach((el) => {
          if (el === nameNode || el === metaNode) {
            return;
          }
          const lower = String(el.textContent || "").trim().toLowerCase();
          if (
            lower === "name" ||
            lower === "\u00b7" ||
            /\bsharing\b/i.test(lower) ||
            /\bemail\b/i.test(lower)
          ) {
            el.textContent = "";
            (el as HTMLElement).style.display = "none";
          }
        });
      });
    }, [state, data, template, travellers]);

    if (state !== "ready" || !data || !template || travellers.length === 0) {
      return <Component {...props} />;
    }

    return (
      <Component
        {...props}
        style={{
          ...(props.style || {}),
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        {travellers.map((_, index) => (
          <div
            key={`status-traveller-row-${index}`}
            ref={(el) => {
              rowRefs.current[index] = el;
            }}
            style={{ width: "100%" }}
          >
            {React.cloneElement(template, {
              key: `status-traveller-template-${index}`,
              style: {
                ...((template.props as any)?.style || {}),
                width: "100%",
                position: "relative",
              },
            })}
          </div>
        ))}
      </Component>
    );
  };
}

// ═════════════════════════════════════════════════════════════
// 5. DYNAMIC STATUS OVERRIDES
// ═════════════════════════════════════════════════════════════

export function withHeadingText(Component): ComponentType {
  return textOverride(
    (d) => {
      const status = settlementStatus(d);
      if (status === "fully_paid" || status === "partially_paid") {
        return "Booking Confirmed!";
      }
      if (d.payment_status === "failed") return "Payment Failed";
      return "Processing\u2026";
    },
    "Loading\u2026",
  )(Component);
}

export function withSubheadingText(Component): ComponentType {
  return textOverride(
    (d) => {
      const status = settlementStatus(d);
      if (status === "fully_paid") {
        return "Your adventure awaits. Here's everything you need to know.";
      }
      if (status === "partially_paid") {
        return `Booking confirmed. ${
          fmt(dueAmount(d))
        } is due on-site before trip departure.`;
      }
      if (d.payment_status === "failed") {
        return "Your payment didn't go through. Don't worry, you can try again.";
      }
      if (_pendingCountdown > 0) {
        return `We're still confirming your payment. Rechecking and redirecting in ${_pendingCountdown}s.`;
      }
      return "We're confirming your payment\u2026";
    },
    "",
  )(Component);
}

export function withStatusIcon(Component): ComponentType {
  return (props: any) => {
    const [data, state] = useBooking();
    const isHydrated = useHydrated();

    if (!isHydrated || state !== "ready" || !data) {
      return <Component {...props} />;
    }

    const isFailed = data.payment_status === "failed";
    const isPending = data.payment_status === "pending";

    const Icon = useMemo(() => {
      if (isFailed) {
        return (
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              background: "#ef4444",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto",
            }}
          >
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </div>
        );
      }
      if (isPending) {
        return (
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              background: "#f59e0b",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto",
            }}
          >
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
        );
      }
      return null;
    }, [isFailed, isPending]);

    return (
      <Component {...props}>
        {Icon}
      </Component>
    );
  };
}

export function withRetryButton(Component): ComponentType {
  return (props: any) => {
    const [data, state] = useBooking();
    const [isRetrying, setIsRetrying] = useState(false);
    const isHydrated = useHydrated();

    if (!isHydrated || state !== "ready" || !data) {
      return (
        <Component {...props} style={{ ...props.style, display: "none" }} />
      );
    }

    if (data.payment_status === "paid") {
      return (
        <Component {...props} style={{ ...props.style, display: "none" }} />
      );
    }

    const handleRetry = () => {
      if (isRetrying) return;
      setIsRetrying(true);

      fetchGateway("retry-payment", {
        method: "POST",
        body: JSON.stringify({
          booking_id: data.id,
          email: String(data.email || "").trim(),
        }),
      })
        .then((res) => {
          if (!res.ok) throw new Error(`Retry failed (${res.status})`);
          return res.json();
        })
        .then((payload) => {
          const payu = payload?.payu;
          if (!payu?.action) throw new Error("Invalid PayU response");

          const form = document.createElement("form");
          form.method = "POST";
          form.action = String(payu.action);
          form.style.display = "none";

          for (const [key, value] of Object.entries(payu)) {
            if (key === "action") continue;
            const input = document.createElement("input");
            input.type = "hidden";
            input.name = key;
            input.value = String(value ?? "");
            form.appendChild(input);
          }

          document.body.appendChild(form);
          form.submit();
        })
        .catch((err) => {
          console.error("[RetryPayment] Error:", err);
          if (data.trip_id) {
            window.location.href = `${DOMESTIC_TRIPS_BASE_URL}/${data.trip_id}`;
          } else {
            window.location.href = DOMESTIC_TRIPS_BASE_URL;
          }
        })
        .finally(() => {
          setIsRetrying(false);
        });
    };

    return (
      <div
        onClick={handleRetry}
        style={{
          cursor: isRetrying ? "wait" : "pointer",
          display: "inline-block",
          padding: "14px 32px",
          background: isRetrying
            ? "linear-gradient(135deg, #94a3b8, #64748b)"
            : "linear-gradient(135deg, #1b91c9, #0085c1)",
          color: "#fff",
          borderRadius: "12px",
          fontSize: "16px",
          fontWeight: 600,
          textAlign: "center" as const,
          marginTop: "16px",
          transition: "all 0.2s",
          opacity: isRetrying ? 0.7 : 1,
          pointerEvents: isRetrying ? "none" : "auto",
        }}
        onMouseEnter={(e) => {
          if (!isRetrying) (e.target as HTMLElement).style.opacity = "0.85";
        }}
        onMouseLeave={(e) => {
          if (!isRetrying) (e.target as HTMLElement).style.opacity = "1";
        }}
      >
        {isRetrying ? "Retrying\u2026" : "Try Again"}
      </div>
    );
  };
}

export function withHideOnFailure(Component): ComponentType {
  return (props: any) => {
    const [data, state] = useBooking();
    if (state === "ready" && data && data.payment_status === "failed") {
      return (
        <Component {...props} style={{ ...props.style, display: "none" }} />
      );
    }
    return <Component {...props} />;
  };
}

export function withHideWhenNoBalance(Component): ComponentType {
  return (props: any) => {
    const [data, state] = useBooking();
    if (state === "ready" && data && dueAmount(data) <= 0) {
      return (
        <Component
          {...props}
          style={{ ...(props.style || {}), display: "none" }}
        />
      );
    }
    return <Component {...props} />;
  };
}

export function withHideWhenNoCoupon(Component): ComponentType {
  return (props: any) => {
    const [data, state] = useBooking();
    const hasCoupon = Boolean(String((data as any)?.coupon_code || "").trim());
    if (state === "ready" && !hasCoupon) {
      return (
        <Component
          {...props}
          style={{ ...(props.style || {}), display: "none" }}
        />
      );
    }
    return <Component {...props} />;
  };
}

export function withHideWhenNoDiscount(Component): ComponentType {
  return (props: any) => {
    const [data, state] = useBooking();
    const discount = data ? discountAmount(data) : 0;
    if (state === "ready" && discount <= 0) {
      return (
        <Component
          {...props}
          style={{ ...(props.style || {}), display: "none" }}
        />
      );
    }
    return <Component {...props} />;
  };
}
