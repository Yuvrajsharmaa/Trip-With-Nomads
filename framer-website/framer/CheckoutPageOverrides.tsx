import React from "react";
import type { ComponentType } from "react";
import { createStore } from "https://framer.com/m/framer/store.js@^1.0.0";

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

const {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} = React;

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
 * CURRENT_RUNTIME: Dynamic configuration based on the environment.
 * Ensures the app knows whether to route to staging or production gateways.
 */
const CURRENT_RUNTIME =
  (typeof window !== "undefined"
    ? (window as any).__TWN_RUNTIME_CONFIG__
    : null) || {
    siteBaseUrl: isFramerRuntimeHost()
      ? "https://maroon-aside-814100.framer.app"
      : "https://tripwithnomads.com",
    apiBaseUrl: isFramerRuntimeHost()
      ? "https://twn-checkout-gateway-staging.tripwithnomads-crm.workers.dev"
      : "https://twn-checkout-gateway.tripwithnomads-crm.workers.dev",
    supabaseUrl: "https://ieuwiinbvbdvjrdqqzlb.supabase.co",
    supabaseAnonKey: "", // Not used when gateway is active
  };

const GATEWAY_BASE = String(
  CURRENT_RUNTIME.apiBaseUrl || CURRENT_RUNTIME.gatewayUrl || "",
);
const PRODUCTION_GATEWAY_BASE =
  "https://twn-checkout-gateway.tripwithnomads-crm.workers.dev";

const TAX_RATE = 0.05;
const CHECKOUT_PAGE_URL = `${CURRENT_RUNTIME.siteBaseUrl}/checkout`;
const UPCOMING_TRIPS_BASE_URL = `${CURRENT_RUNTIME.siteBaseUrl}/upcoming-trips`;

const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\+?[\d\s\-()]{10,15}$/;
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
const TRIP_ID_SOURCE_EVENT = "twn:trip-id-source";
const tripDisplayCache = new Map<string, { ts: number; data: any }>();
const tripDisplayInFlight = new Map<string, Promise<any | null>>();
let forcedTripId = "";
let razorpayScriptPromise: Promise<void> | null = null;

type CheckoutContextDisplayData = {
  display_summary: {
    base_price: number;
    payable_price: number;
    save_amount: number;
    has_discount: boolean;
  };
  next_batch_date: string;
};

type PaymentMode = "full" | "partial_25";
type Traveller = {
  id: string;
  name: string;
  transport: string;
  sharing: string;
};
type PricingBreakdown = {
  base_subtotal: number;
  early_bird_discount_amount: number;
  coupon_discount_amount: number;
  applied_discount_source: "none" | "early_bird" | "coupon" | "both";
  applied_discount_code: string | null;
  discount_amount_total: number;
  taxable_amount: number;
  tax_amount: number;
  total_amount: number;
  payable_now_amount: number;
  due_amount: number;
  payment_mode: PaymentMode;
  line_items: Array<
    {
      label: string;
      amount: number;
      type: "base" | "discount" | "tax" | "total";
    }
  >;
};

type CheckoutFieldErrors = Record<string, string>;
type CheckoutTouchedFields = Record<string, boolean>;

type CheckoutStore = {
  tripId: string;
  slug: string;
  tripName: string;
  pricingData: any[];
  date: string;
  transport: string;
  travellers: Traveller[];
  paymentMode: PaymentMode;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  couponCode: string;
  appliedCoupon: any | null;
  couponMessage: string;
  couponMessageType: "neutral" | "success" | "error";
  loading: boolean;
  submitting: boolean;
  inviteOnly: boolean;
  pricingBreakdown: PricingBreakdown | null;
  fieldErrors: CheckoutFieldErrors;
  touchedFields: CheckoutTouchedFields;
  validationSubmitAttempted: boolean;
  checkoutMessage: string;
};

const TravellerContext = createContext<{ id: string; index: number } | null>(
  null,
);
type SummaryLineContextValue = { key: string; label: string; amount: number };
const SummaryLineContext = createContext<SummaryLineContextValue | null>(null);
const CONTACT_NAME_FIELD = "contact_name";
const CONTACT_PHONE_FIELD = "contact_phone";
const CONTACT_EMAIL_FIELD = "contact_email";
const DEPARTURE_DATE_FIELD = "departure_date";

function travellerFieldKey(
  travellerId: string,
  field: "name" | "sharing" | "vehicle",
): string {
  return `traveller.${travellerId}.${field}`;
}

const useStore = createStore({
  tripId: "",
  slug: "",
  tripName: "",
  pricingData: [],
  date: "",
  transport: "",
  travellers: [{ id: "t1", name: "", transport: "", sharing: "" }],
  paymentMode: "full",
  contactName: "",
  contactPhone: "",
  contactEmail: "",
  couponCode: "",
  appliedCoupon: null,
  couponMessage: "",
  couponMessageType: "neutral",
  loading: false,
  submitting: false,
  inviteOnly: false,
  pricingBreakdown: null,
  fieldErrors: {},
  touchedFields: {},
  validationSubmitAttempted: false,
  checkoutMessage: "",
});

function toNumber(value: any): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function fmtINR(value: number): string {
  return INR.format(Math.round(value));
}

function getVariantValue(row: any): string {
  if (!row) return "";
  return String(row.sharing || row.variant_name || row.variant || "").trim();
}

function getTransportValue(row: any): string {
  if (!row) return "";
  return String(row.transport || row.vehicle || "").trim();
}

function normalizePricingRows(rows: any[]): any[] {
  const list = Array.isArray(rows) ? rows : [];
  return list.map((row) => {
    const departureDate = String(
      row?.departure_date || row?.start_date || "",
    ).trim();
    const transport = String(row?.transport || row?.vehicle || "").trim();
    const sharing = String(
      row?.sharing || row?.variant_name || row?.variant || "",
    ).trim();
    return {
      ...row,
      departure_date: departureDate,
      transport,
      sharing,
    };
  });
}

function getDateOptions(pricing: any[]): string[] {
  const dates = pricing
    .map((p) => String(p.departure_date || "").trim())
    .filter((d) => d && d !== "null");
  return Array.from(new Set(dates)).sort();
}

function getTransportOptions(pricing: any[], date: string): string[] {
  if (!date) return [];
  const options = pricing
    .filter((p) => String(p.departure_date || "").trim() === date)
    .map((p) => getTransportValue(p))
    .filter(Boolean);
  return Array.from(new Set(options)).sort();
}

function getSharingOptions(
  pricing: any[],
  date: string,
  transport: string,
): string[] {
  if (!date) return [];
  const options = pricing
    .filter((p) => {
      const dMatch = String(p.departure_date || "").trim() === date;
      const tMatch = !transport || getTransportValue(p) === transport;
      return dMatch && tMatch;
    })
    .map((p) => getVariantValue(p))
    .filter(Boolean);
  return Array.from(new Set(options));
}

function getDefaultTransportForDate(
  pricing: any[],
  date: string,
  current: string,
): string {
  const options = getTransportOptions(pricing, date);
  if (options.includes(current)) return current;
  return options[0] || "";
}

function getDefaultSharingForDate(
  pricing: any[],
  date: string,
  transport: string,
): string {
  const options = getSharingOptions(pricing, date, transport);
  return options[0] || "";
}

function hasVehicleOptions(pricing: any[], date: string): boolean {
  return getTransportOptions(pricing, date).length > 0;
}

function normalizeTravellers(list: any[]): Traveller[] {
  const raw = Array.isArray(list) ? list : [];
  if (raw.length === 0) {
    return [{ id: "t1", name: "", transport: "", sharing: "" }];
  }
  return raw.map((item, index) => ({
    id: String(item.id || `t${index + 1}`),
    name: String(item.name || "").trim(),
    transport: String(item.transport || "").trim(),
    sharing: String(item.sharing || "").trim(),
  }));
}

function sanitizeTravellersForDate(
  pricing: any[],
  date: string,
  travellers: Traveller[],
  defaultTransport: string,
): Traveller[] {
  const vehicleRequired = hasVehicleOptions(pricing, date);
  return travellers.map((t) => {
    const transport = vehicleRequired
      ? t.transport && getTransportOptions(pricing, date).includes(t.transport)
        ? t.transport
        : defaultTransport
      : "";
    const sharingOptions = getSharingOptions(pricing, date, transport);
    const sharing = t.sharing && sharingOptions.includes(t.sharing)
      ? t.sharing
      : sharingOptions[0] || "";
    return { ...t, transport, sharing };
  });
}

function getTravellerByContext(
  store: any,
  ctx: { id: string },
): Traveller | null {
  return store.travellers.find((t) => t.id === ctx.id) || null;
}

function updateTravellerById(
  store: any,
  id: string,
  patch: Partial<Traveller>,
): Traveller[] {
  return store.travellers.map((t) => (t.id === id ? { ...t, ...patch } : t));
}

function removeTravellerById(store: any, id: string): Traveller[] {
  const next = store.travellers.filter((t) => t.id !== id);
  return next.length > 0
    ? next
    : [{ id: "t1", name: "", transport: "", sharing: "" }];
}

function nextTravellerId(store: any): string {
  const ids = store.travellers.map((t) =>
    parseInt(t.id.replace(/\D/g, "") || "0")
  );
  const max = Math.max(0, ...ids);
  return `t${max + 1}`;
}

function normalizeSharing(value: any): string {
  return String(value || "").trim();
}

function normalizeTravellerTransport(
  pricing: any[],
  date: string,
  value: any,
  fallback: string,
): string {
  const clean = String(value || "").trim();
  const options = getTransportOptions(pricing, date);
  if (options.includes(clean)) return clean;
  return options.includes(fallback) ? fallback : options[0] || "";
}

function findBestPricingRow(
  pricing: any[],
  date: string,
  transport: string,
  sharing: string,
): any | null {
  const rows = pricing.filter((p) => {
    const dMatch = String(p.departure_date || "").trim() === date;
    const tMatch = !transport || getTransportValue(p) === transport;
    const sMatch = getVariantValue(p) === sharing;
    return dMatch && tMatch && sMatch;
  });
  if (rows.length === 0) return null;
  return rows.reduce((best, curr) => {
    const bestEarly = Boolean(best.is_early_bird);
    const currEarly = Boolean(curr.is_early_bird);
    if (currEarly && !bestEarly) return curr;
    if (currEarly && bestEarly) {
      return (curr.price || 0) < (best.price || 0) ? curr : best;
    }
    return best;
  }, rows[0] || null);
}

function resolvePriceForTraveller(
  pricing: any[],
  date: string,
  transport: string,
  sharing: string,
): number {
  if (!date || !sharing) return 0;
  const row = findBestPricingRow(pricing, date, transport, sharing);
  return toNumber(row?.price || row?.amount || 0);
}

function buildLocalPricingBreakdown(store: CheckoutStore): PricingBreakdown {
  const travellers = normalizeTravellers(store.travellers || []);
  const date = store.date;
  const pricing = store.pricingData || [];

  let subtotal = 0;
  let earlyBirdDiscount = 0;
  const lineItems: any[] = [];

  travellers.forEach((t) => {
    const row = findBestPricingRow(pricing, date, t.transport, t.sharing);
    const basePrice = toNumber(row?.base_price || row?.price || 0);
    const actualPrice = toNumber(row?.price || 0);
    const isEarlyBird = Boolean(row?.is_early_bird);

    subtotal += basePrice;
    if (isEarlyBird && basePrice > actualPrice) {
      earlyBirdDiscount += basePrice - actualPrice;
    }
  });

  const taxableBeforeCoupon = Math.max(0, subtotal - earlyBirdDiscount);
  const appliedCoupon = store?.appliedCoupon?.valid ? store.appliedCoupon : null;
  const couponSource = String(
    appliedCoupon?.final_applied_source ||
    appliedCoupon?.applied_discount_source ||
    "",
  )
    .trim()
    .toLowerCase();
  const explicitCouponDiscount = toNumber(
    appliedCoupon?.coupon_discount_amount || appliedCoupon?.discount_amount,
  );
  const minSubtotal = toNumber(appliedCoupon?.min_subtotal);
  const couponEligible = !appliedCoupon || minSubtotal <= 0 ||
    taxableBeforeCoupon >= minSubtotal;

  let couponDiscount = 0;
  if (appliedCoupon && couponEligible) {
    if (explicitCouponDiscount > 0) {
      couponDiscount = explicitCouponDiscount;
    } else {
      const discountType = String(appliedCoupon?.discount_type || "")
        .trim()
        .toLowerCase();
      const discountValue = toNumber(appliedCoupon?.discount_value);
      if (discountType === "fixed") {
        couponDiscount = discountValue;
      } else if (discountType === "percentage" || discountType === "percent") {
        couponDiscount = (taxableBeforeCoupon * discountValue) / 100;
      }
    }
  }

  couponDiscount = Math.max(0, Math.min(couponDiscount, taxableBeforeCoupon));
  const discountTotal = earlyBirdDiscount + couponDiscount;
  const taxableAmount = Math.max(0, subtotal - discountTotal);
  const tax = taxableAmount * TAX_RATE;
  const total = taxableAmount + tax;

  const paymentMode = store.paymentMode || "full";
  const payableNow = paymentMode === "partial_25" ? total * 0.25 : total;
  const dueAmount = total - payableNow;

  return {
    base_subtotal: subtotal,
    early_bird_discount_amount: earlyBirdDiscount,
    coupon_discount_amount: couponDiscount,
    applied_discount_source:
      couponDiscount > 0 && earlyBirdDiscount > 0
        ? "both"
        : couponDiscount > 0
          ? "coupon"
          : earlyBirdDiscount > 0
            ? "early_bird"
            : couponSource === "coupon" || couponSource === "both"
              ? "coupon"
              : "none",
    applied_discount_code:
      couponDiscount > 0
        ? String(appliedCoupon?.code || "").trim().toUpperCase() || null
        : null,
    discount_amount_total: discountTotal,
    taxable_amount: taxableAmount,
    tax_amount: tax,
    total_amount: total,
    payable_now_amount: payableNow,
    due_amount: dueAmount,
    payment_mode: paymentMode,
    line_items: [
      { label: "Trip Subtotal", amount: subtotal, type: "base" as const },
      ...(earlyBirdDiscount > 0
        ? [{
          label: "Early Bird Discount",
          amount: -earlyBirdDiscount,
          type: "discount" as const,
        }]
        : []),
      ...(couponDiscount > 0
        ? [{
          label: `Coupon ${String(appliedCoupon?.code || "").trim().toUpperCase() || "Discount"
            }`,
          amount: -couponDiscount,
          type: "discount" as const,
        }]
        : []),
      { label: "Tax (5%)", amount: tax, type: "tax" as const },
      { label: "Total Amount", amount: total, type: "total" as const },
    ],
  };
}

function buildPricingBreakdownFromQuote(
  data: any,
  store: CheckoutStore,
): PricingBreakdown {
  const baseSubtotal = toNumber(
    data.base_subtotal ?? data.subtotal_amount ?? data.subtotal,
  );
  const earlyBirdDiscount = toNumber(data.early_bird_discount_amount);
  const source = String(
    data.applied_discount_source || data.final_applied_source || "",
  )
    .trim()
    .toLowerCase();
  const rawDiscountTotal = toNumber(
    data.discount_amount_total ?? data.discount_amount,
  );
  const explicitCouponDiscount = toNumber(data.coupon_discount_amount);
  const couponDiscount = explicitCouponDiscount > 0
    ? explicitCouponDiscount
    : (source === "coupon" || source === "both")
      ? rawDiscountTotal
      : 0;
  const discountTotal = rawDiscountTotal > 0
    ? rawDiscountTotal
    : Math.max(earlyBirdDiscount, couponDiscount);
  const taxableAmount = toNumber(
    data.taxable_amount ?? Math.max(0, baseSubtotal - discountTotal),
  );
  const taxAmount = toNumber(data.tax_amount ?? taxableAmount * TAX_RATE);
  const paymentMode = store.paymentMode || "full";
  const total = toNumber(data.total_amount ?? taxableAmount + taxAmount);
  const payableNow = paymentMode === "partial_25" ? total * 0.25 : total;
  const dueAmount = total - payableNow;
  const appliedSource = source === "coupon" || source === "both"
    ? "coupon"
    : source === "early_bird"
      ? "early_bird"
      : discountTotal > 0 && couponDiscount > 0
        ? "coupon"
        : "none";

  const lineItems: PricingBreakdown["line_items"] =
    Array.isArray(data.line_items) && data.line_items.length > 0
      ? data.line_items
      : [
        { label: "Trip Subtotal", amount: baseSubtotal, type: "base" as const },
        ...(discountTotal > 0
          ? [{
            label: "Discount",
            amount: -discountTotal,
            type: "discount" as const,
          }]
          : []),
        { label: "Tax (5%)", amount: taxAmount, type: "tax" as const },
        { label: "Total Amount", amount: total, type: "total" as const },
      ];

  return {
    base_subtotal: baseSubtotal,
    early_bird_discount_amount: earlyBirdDiscount,
    coupon_discount_amount: couponDiscount,
    applied_discount_source: appliedSource,
    applied_discount_code: data.applied_discount_code || data.code || null,
    discount_amount_total: discountTotal,
    taxable_amount: taxableAmount,
    tax_amount: taxAmount,
    total_amount: total,
    payable_now_amount: payableNow,
    due_amount: dueAmount,
    payment_mode: paymentMode,
    line_items: lineItems,
  };
}

function computeTotals(store: CheckoutStore) {
  const breakdown = store.pricingBreakdown || buildLocalPricingBreakdown(store);
  return {
    subtotal: breakdown.base_subtotal,
    discount: breakdown.discount_amount_total,
    earlyBirdDiscount: breakdown.early_bird_discount_amount,
    couponDiscount: breakdown.coupon_discount_amount,
    appliedDiscountSource: breakdown.applied_discount_source,
    appliedDiscountCode: breakdown.applied_discount_code,
    tax: breakdown.tax_amount,
    total: breakdown.total_amount,
    payableNow: breakdown.payable_now_amount,
    dueAmount: breakdown.due_amount,
    paymentMode: breakdown.payment_mode,
    breakdown,
  };
}

function getAppliedCouponCode(store: CheckoutStore): string {
  const totals = computeTotals(store);
  const fromApplied = String(store.appliedCoupon?.code || "").trim();
  if (fromApplied) return fromApplied.toUpperCase();
  const fromTotals = String(totals.appliedDiscountCode || "").trim();
  return fromTotals.toUpperCase();
}

function hasAppliedCoupon(store: CheckoutStore): boolean {
  const totals = computeTotals(store);
  if (toNumber(totals.couponDiscount) > 0) return true;
  if (String(totals.appliedDiscountCode || "").trim()) return true;
  return Boolean(store.appliedCoupon?.valid);
}

function getSummaryLineRows(store: CheckoutStore): SummaryLineContextValue[] {
  const breakdown = store.pricingBreakdown || buildLocalPricingBreakdown(store);
  return (breakdown.line_items || []).map((item, i) => ({
    key: `line-${i}-${item.label}`,
    label: item.label,
    amount: item.amount,
  }));
}

function subtotalLineItemsText(store: CheckoutStore): string {
  const count = normalizeTravellers(store.travellers || []).length;
  return `Subtotal (${count} Traveller${count === 1 ? "" : "s"})`;
}

function formatNextBatchDate(dateStr: string): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function getValidationState(store: CheckoutStore): {
  fieldErrors: CheckoutFieldErrors;
  globalErrors: string[];
} {
  const fieldErrors: CheckoutFieldErrors = {};
  const globalErrors: string[] = [];

  if (!store?.tripId) {
    globalErrors.push("Trip context is missing. Try re-opening the checkout.");
    return { fieldErrors, globalErrors };
  }

  if (!store?.date) {
    fieldErrors[DEPARTURE_DATE_FIELD] = "Departure date is required";
  }

  if (!store?.contactName?.trim()) {
    fieldErrors[CONTACT_NAME_FIELD] = "Contact name is required";
  }

  if (!store?.contactPhone?.trim()) {
    fieldErrors[CONTACT_PHONE_FIELD] = "Phone number is required";
  } else if (!PHONE_REGEX.test(store.contactPhone.trim())) {
    fieldErrors[CONTACT_PHONE_FIELD] = "Phone number is invalid";
  }

  if (!store?.contactEmail?.trim()) {
    fieldErrors[CONTACT_EMAIL_FIELD] = "Email is required";
  } else if (!EMAIL_REGEX.test(store.contactEmail.trim())) {
    fieldErrors[CONTACT_EMAIL_FIELD] = "Email is invalid";
  }

  const travellers = normalizeTravellers(store?.travellers || []);
  const requireVehicle = hasVehicleOptions(
    store?.pricingData || [],
    store?.date || "",
  );

  travellers.forEach((t, index) => {
    if (!t.name.trim()) {
      fieldErrors[travellerFieldKey(t.id, "name")] =
        `Name required for Traveller ${index + 1}`;
    }
    if (requireVehicle && !t.transport) {
      fieldErrors[travellerFieldKey(t.id, "vehicle")] =
        `Vehicle required for Traveller ${index + 1}`;
    }
    if (!t.sharing) {
      fieldErrors[travellerFieldKey(t.id, "sharing")] =
        `Sharing required for Traveller ${index + 1}`;
    }
  });

  const totals = computeTotals(store);
  if (totals.total <= 0) {
    globalErrors.push("Total amount must be greater than zero");
  }

  return { fieldErrors, globalErrors };
}

function getValidationErrors(store: CheckoutStore): string[] {
  const validation = getValidationState(store);
  return [...Object.values(validation.fieldErrors), ...validation.globalErrors];
}

function applyValidationPatch(
  store: CheckoutStore,
  patch: Partial<CheckoutStore>,
): Partial<CheckoutStore> {
  const nextStore = { ...store, ...patch } as CheckoutStore;
  const validation = getValidationState(nextStore);
  return {
    ...patch,
    fieldErrors: validation.fieldErrors,
  };
}

function markFieldTouched(store: CheckoutStore, fieldKey: string) {
  return {
    ...(store.touchedFields || {}),
    [fieldKey]: true,
  };
}

function getVisibleFieldError(store: CheckoutStore, fieldKey: string): string {
  const show = Boolean(
    store.validationSubmitAttempted || store.touchedFields?.[fieldKey],
  );
  if (!show) return "";
  return String(store.fieldErrors?.[fieldKey] || "").trim();
}

function buildAllTouchedFields(store: CheckoutStore): CheckoutTouchedFields {
  const touched: CheckoutTouchedFields = {
    ...(store.touchedFields || {}),
    [CONTACT_NAME_FIELD]: true,
    [CONTACT_PHONE_FIELD]: true,
    [CONTACT_EMAIL_FIELD]: true,
    [DEPARTURE_DATE_FIELD]: true,
  };
  const travellers = normalizeTravellers(store.travellers || []);
  travellers.forEach((traveller) => {
    touched[travellerFieldKey(traveller.id, "name")] = true;
    touched[travellerFieldKey(traveller.id, "sharing")] = true;
    touched[travellerFieldKey(traveller.id, "vehicle")] = true;
  });
  return touched;
}

function firstNonEmpty(...values: any[]): string {
  for (const value of values) {
    const next = String(value || "").trim();
    if (next) return next;
  }
  return "";
}

function readInputValue(selectors: string[]): string {
  if (typeof document === "undefined") return "";
  for (const selector of selectors) {
    const el = document.querySelector(selector) as
      | HTMLInputElement
      | HTMLTextAreaElement
      | null;
    const value = String(el?.value || "").trim();
    if (value) return value;
  }
  return "";
}

function buildGatewayUrl(path: string, params?: URLSearchParams): string {
  const base = String(GATEWAY_BASE || "").trim().replace(/\/+$/, "");
  const endpoint = String(path || "").trim().replace(/^\/+/, "");
  const query = params?.toString() || "";
  return `${base}/${endpoint}${query ? `?${query}` : ""}`;
}

function buildGatewayUrlFromBase(
  baseUrl: string,
  path: string,
  params?: URLSearchParams,
): string {
  const base = String(baseUrl || "").trim().replace(/\/+$/, "");
  const endpoint = String(path || "").trim().replace(/^\/+/, "");
  const query = params?.toString() || "";
  return `${base}/${endpoint}${query ? `?${query}` : ""}`;
}

function resolveGatewayBases(): string[] {
  const normalizedPrimary = String(GATEWAY_BASE || "").trim().replace(/\/+$/, "");
  const normalizedProd = String(PRODUCTION_GATEWAY_BASE).trim().replace(/\/+$/, "");
  const bases: string[] = [];
  if (normalizedPrimary) bases.push(normalizedPrimary);
  if (isFramerRuntimeHost() && normalizedProd) bases.push(normalizedProd);
  return Array.from(new Set(bases));
}

function fetchGateway(
  path: string,
  init: RequestInit = {},
  params?: URLSearchParams,
  baseOverride?: string,
): Promise<Response> {
  const url = baseOverride
    ? buildGatewayUrlFromBase(baseOverride, path, params)
    : buildGatewayUrl(path, params);
  return fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
}

function ensureRazorpayScript(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Razorpay is not available on server"));
  }
  if (typeof (window as any).Razorpay === "function") return Promise.resolve();
  if (razorpayScriptPromise) return razorpayScriptPromise;

  razorpayScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(
      'script[src="https://checkout.razorpay.com/v1/checkout.js"]',
    ) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Failed to load Razorpay script")),
        { once: true },
      );
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Razorpay script"));
    document.head.appendChild(script);
  }).finally(() => {
    if (typeof (window as any).Razorpay !== "function") {
      razorpayScriptPromise = null;
    }
  });

  return razorpayScriptPromise || Promise.reject(new Error("Failed to initialize Razorpay script"));
}

function populateDropdown(select: HTMLSelectElement, options: string[]) {
  if (!select) return;

  const firstOption = select.options[0];
  const placeholderText = firstOption &&
    (firstOption.value === "" || /select/i.test(firstOption.text))
    ? firstOption.text
    : "Select option";

  select.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.text = placeholderText;
  select.add(placeholder);

  options.forEach((value) => {
    const opt = document.createElement("option");
    opt.value = value;
    opt.text = value;
    select.add(opt);
  });
}

function fetchTripIdBySlug(slug: string): Promise<string> {
  const cleanSlug = (slug || "").trim().toLowerCase();
  if (!cleanSlug) return Promise.resolve("");
  const query = new URLSearchParams();
  query.set("slug", cleanSlug);
  return fetchGateway("get-trip-checkout-context", { method: "GET" }, query)
    .then((res) => {
      if (!res.ok) return "";
      return res.json().then((payload) =>
        String(payload?.trip?.id || "").trim()
      );
    })
    .catch(() => "");
}

function fetchTripContextById(
  tripId: string,
): Promise<{ id: string; slug: string; title: string } | null> {
  const cleanTripId = String(tripId || "").trim();
  if (!cleanTripId) return Promise.resolve(null);
  const query = new URLSearchParams();
  query.set("trip_id", cleanTripId);
  return fetchGateway("get-trip-checkout-context", { method: "GET" }, query)
    .then((res) => {
      if (!res.ok) return null;
      return res.json().then((payload) => {
        if (!payload?.trip?.id) return null;
        return {
          id: String(payload.trip.id || ""),
          slug: String(payload.trip.slug || ""),
          title: String(payload.trip.title || ""),
        };
      });
    })
    .catch(() => null);
}

function isInviteOnlyTrip(pricingRows: any[]): boolean {
  const rows = Array.isArray(pricingRows) ? pricingRows : [];
  if (rows.length === 0) return false;
  const hasSharingRows = rows.some((row) => Boolean(getVariantValue(row)));
  return !hasSharingRows;
}

function fetchTripPricing(tripId: string): Promise<any[]> {
  const cleanTripId = (tripId || "").trim();
  if (!cleanTripId) return Promise.resolve([]);

  const query = new URLSearchParams();
  query.set("trip_id", cleanTripId);
  return fetchGateway("get-trip-checkout-context", { method: "GET" }, query)
    .then((res) => {
      if (!res.ok) return [];
      return res.json().catch(() => null).then((payload) => {
        const rows = Array.isArray(payload?.pricing_rows)
          ? payload.pricing_rows
          : Array.isArray(payload?.pricing)
            ? payload.pricing
            : [];
        return normalizePricingRows(rows);
      });
    })
    .catch(() => []);
}

function createEmptySummary() {
  return {
    base_price: 0,
    payable_price: 0,
    save_amount: 0,
    has_discount: false,
  };
}

function createCheckoutDisplayData(
  summary?: Partial<CheckoutContextDisplayData["display_summary"]> | null,
  nextBatchDate?: string,
): CheckoutContextDisplayData {
  return {
    display_summary: {
      ...createEmptySummary(),
      ...(summary || {}),
    },
    next_batch_date: String(nextBatchDate || "").trim(),
  };
}

function extractSummaryFromRow(row: any) {
  const payable = toNumber(row?.payable_price || row?.price || row?.amount);
  const base = toNumber(row?.base_price || row?.original_price || payable);
  const save = toNumber(
    row?.save_amount || row?.discount_amount || Math.max(base - payable, 0),
  );
  const hasDiscount = Boolean(row?.has_discount) || save > 0 || base > payable;
  return {
    base_price: base > 0 ? base : payable,
    payable_price: payable,
    save_amount: save,
    has_discount: hasDiscount && payable > 0,
  };
}

function buildDisplayDataFromCheckoutRows(
  rows: any[],
  preferredDate?: string,
): CheckoutContextDisplayData | null {
  const normalizedRows = normalizePricingRows(rows || []);
  if (!normalizedRows.length) return null;

  const validRows = normalizedRows.filter((row) => {
    const payable = toNumber(row?.payable_price || row?.price || row?.amount);
    return payable > 0;
  });
  if (!validRows.length) return null;

  const date = String(preferredDate || "").trim();
  const matchedRows = date
    ? validRows.filter((row) => String(row?.departure_date || "").trim() === date)
    : [];
  const workingRows = matchedRows.length > 0 ? matchedRows : validRows;

  const payableValues = workingRows
    .map((row) =>
      toNumber(row?.price || row?.payable_price || row?.base_price || row?.amount)
    )
    .filter((value) => value > 0);
  if (!payableValues.length) return null;
  const lowest = Math.min(...payableValues);
  const selectedRow =
    workingRows.find((row) =>
      toNumber(row?.payable_price || row?.price || row?.amount) === lowest
    ) || workingRows[0];

  const dateCandidates = normalizedRows
    .map((row) => String(row?.departure_date || row?.start_date || "").trim())
    .filter(Boolean)
    .sort();
  const nextBatchDate =
    String(selectedRow?.departure_date || "").trim() || dateCandidates[0] || "";

  return createCheckoutDisplayData(extractSummaryFromRow(selectedRow), nextBatchDate);
}

type CheckoutFetchFailureReason =
  | "none"
  | "trip_not_found"
  | "invalid_identifier"
  | "network";

type CheckoutFetchResult = {
  data: CheckoutContextDisplayData | null;
  failureReason: CheckoutFetchFailureReason;
};

function normalizeCheckoutFailureReason(
  status: number,
  rawMessage: string,
): CheckoutFetchFailureReason {
  const message = String(rawMessage || "").toLowerCase();
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

function fetchCheckoutDisplayData(
  params: { slug?: string; tripId?: string; date?: string },
): Promise<CheckoutFetchResult> {
  const query = new URLSearchParams();
  const slug = normalizeSlug(params.slug);
  const tripId = normalizeTripId(params.tripId);
  if (slug) query.set("slug", slug);
  if (tripId) query.set("trip_id", tripId);
  if (!slug && !tripId) {
    return Promise.resolve({ data: null, failureReason: "invalid_identifier" });
  }

  const gatewayBases = resolveGatewayBases();
  const request = async (): Promise<CheckoutFetchResult> => {
    let lastReason: CheckoutFetchFailureReason = "network";
    for (const gatewayBase of gatewayBases) {
      try {
        const res = await fetchGateway(
          "get-trip-checkout-context",
          { method: "GET" },
          query,
          gatewayBase,
        );
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          lastReason = normalizeCheckoutFailureReason(
            res.status,
            String(payload?.error || payload?.message || ""),
          );
          continue;
        }
        const payload = await res.json().catch(() => null);
        const rows = Array.isArray(payload?.pricing_rows)
          ? payload.pricing_rows
          : Array.isArray(payload?.pricing)
            ? payload.pricing
            : [];
        return {
          data: buildDisplayDataFromCheckoutRows(rows, params.date),
          failureReason: "none",
        };
      } catch (_error) {
        lastReason = "network";
      }
    }
    return { data: null, failureReason: lastReason };
  };
  return request();
}

function fetchTripDisplayPrice(
  params: { slug?: string; tripId?: string; date?: string },
): Promise<any | null> {
  const rawSlug = String(params.slug || "").trim();
  const rawTripId = String(params.tripId || "").trim();
  const fallbackSlug = normalizeSlug(rawSlug);
  const tripId = normalizeTripId(rawTripId);
  const activeTripId = tripId;
  const activeSlug = activeTripId ? "" : fallbackSlug;
  const activeDate = String(params.date || "").trim();
  if (!activeSlug && !activeTripId) return Promise.resolve(null);

  const cacheKey = `${activeSlug}::${activeTripId}::${fallbackSlug}::${activeDate}`;
  const now = Date.now();
  const cached = tripDisplayCache.get(cacheKey);
  if (cached && now - cached.ts < 120000) {
    return Promise.resolve(cached.data);
  }
  const inFlight = tripDisplayInFlight.get(cacheKey);
  if (inFlight) return inFlight;

  const request = (async () => {
    const primaryResult = await fetchCheckoutDisplayData({
      slug: activeSlug,
      tripId: activeTripId,
      date: activeDate,
    });
    if (primaryResult.data) {
      return primaryResult.data;
    }

    // Trip ID failed — try slug fallback before giving up.
    // This handles stale/orphaned trip IDs in Framer CMS props.
    const urlSlug = fallbackSlug ||
      (typeof window !== "undefined"
        ? getTripSlugFromPathname(window.location.pathname)
        : "");
    if (urlSlug && activeTripId) {
      const slugResult = await fetchCheckoutDisplayData({
        slug: urlSlug,
        tripId: "",
        date: activeDate,
      });
      if (slugResult.data) {
        return slugResult.data;
      }
    }

    return null;
  })()
    .then((data) => {
      tripDisplayCache.set(cacheKey, { ts: Date.now(), data });
      return data;
    })
    .finally(() => {
      tripDisplayInFlight.delete(cacheKey);
    });

  tripDisplayInFlight.set(cacheKey, request);
  return request;
}

function toTitleFromSlug(slug: string): string {
  const clean = String(slug || "").trim();
  if (!clean) return "";
  return clean
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function readCheckoutRouteContext() {
  if (typeof window === "undefined") {
    return { tripId: "", date: "", transport: "" };
  }
  const query = new URLSearchParams(window.location.search);
  return {
    tripId: String(query.get("tripId") || query.get("trip_id") || "").trim(),
    date: String(query.get("date") || "").trim(),
    transport: String(query.get("vehicle") || query.get("transport") || "")
      .trim(),
  };
}

function routeContextKey(ctx: {
  tripId: string;
  date: string;
  transport: string;
}): string {
  return [ctx.tripId, ctx.date, ctx.transport].join("|");
}

function withTextFromState(
  getText: (store: any) => string,
  fallback = "\u2014",
) {
  return function (Component: ComponentType): ComponentType {
    return (props: any) => {
      const [store] = useStore();
      const isHydrated = useHydrated();
      const text = isHydrated ? (getText(store) || fallback) : fallback;
      return <Component {...props} text={text} />;
    };
  };
}

function readNodeText(value: any): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => readNodeText(item)).join(" ");
  }
  if (React.isValidElement(value)) {
    return readNodeText((value as any)?.props?.children);
  }
  if (typeof value === "object" && value?.props) {
    return readNodeText(value.props.children);
  }
  return "";
}

export function withCheckoutBootstrap(Component): ComponentType {
  return (props: any) => {
    const [store, setStore] = useStore();
    const bootKeyRef = useRef("");
    const [routeKey, setRouteKey] = useState(() =>
      routeContextKey(readCheckoutRouteContext())
    );

    useEffect(() => {
      const refreshRouteKey = () => {
        const key = routeContextKey(readCheckoutRouteContext());
        setRouteKey((prev) => (prev === key ? prev : key));
      };

      const interval = window.setInterval(refreshRouteKey, 500);
      window.addEventListener("popstate", refreshRouteKey);
      refreshRouteKey();

      return () => {
        window.clearInterval(interval);
        window.removeEventListener("popstate", refreshRouteKey);
      };
    }, []);

    useEffect(() => {
      let disposed = false;

      const loadTripData = (
        tripId: string,
        ctx: { date: string; transport: string },
      ) => {
        return Promise.all([
          fetchTripPricing(tripId),
          fetchTripContextById(tripId),
        ]).then(([pricing, tripContext]) => {
          if (disposed) return;

          const slug = String(tripContext?.slug || "").trim();
          const tripName = firstNonEmpty(
            String(tripContext?.title || "").trim(),
            toTitleFromSlug(slug),
            tripId,
          );

          const inviteOnly = isInviteOnlyTrip(pricing);
          const dates = getDateOptions(pricing);
          const date = dates.includes(ctx.date) ? ctx.date : dates[0] || "";
          const transport = getDefaultTransportForDate(
            pricing,
            date,
            ctx.transport,
          );
          const travellers = inviteOnly
            ? normalizeTravellers(store.travellers || [])
            : sanitizeTravellersForDate(
              pricing,
              date,
              normalizeTravellers(store.travellers || []),
              transport,
            );

          const nextState = {
            ...store,
            tripId,
            slug,
            tripName,
            pricingData: pricing,
            date,
            transport,
            travellers,
            inviteOnly,
            loading: false,
          };
          const pricingBreakdown = buildLocalPricingBreakdown(nextState);

          setStore({
            tripId,
            slug,
            tripName,
            pricingData: pricing,
            date,
            transport,
            travellers,
            inviteOnly,
            pricingBreakdown,
            loading: false,
            fieldErrors: {},
            touchedFields: {},
            validationSubmitAttempted: false,
            checkoutMessage: "",
          });

          if (isFramerRuntimeHost()) {
            console.log("[Checkout] Opened", {
              tripId,
              slug,
              date,
              defaultTransport: transport,
              inviteOnly,
            });
          }
        });
      };

      const run = () => {
        const ctx = readCheckoutRouteContext();
        if (!ctx.tripId) {
          // No query param tripId — try resolving from ?slug= param
          const slugParam = String(new URLSearchParams(window.location.search).get("slug") || "").trim().toLowerCase();
          if (!slugParam) return;
          if (bootKeyRef.current === routeKey) return;
          bootKeyRef.current = routeKey;
          setStore({ loading: true });
          return fetchTripIdBySlug(slugParam).then((resolvedTripId) => {
            if (!resolvedTripId) {
              if (!disposed) setStore({ loading: false, checkoutMessage: "Trip not found." });
              return;
            }
            return loadTripData(resolvedTripId, ctx);
          });
        }

        if (bootKeyRef.current === routeKey) return;
        bootKeyRef.current = routeKey;

        setStore({ loading: true });
        const tripId = ctx.tripId;

        return loadTripData(tripId, ctx);
      };

      Promise.resolve()
        .then(() => run())
        .catch((err) => {
          if (isFramerRuntimeHost()) console.error("[Checkout] Bootstrap failed", err);
          if (!disposed) {
            setStore({
              loading: false,
              checkoutMessage: "Could not initialize checkout",
            });
          }
        });

      return () => {
        disposed = true;
      };
    }, [routeKey]);

    useEffect(() => {
      if (!store?.tripId) return;
      setStore({
        pricingBreakdown: buildLocalPricingBreakdown(store),
      });
    }, [
      store.tripId,
      store.pricingData,
      store.date,
      store.travellers,
      store.appliedCoupon,
    ]);

    return <Component {...props} />;
  };
}

export function withBookNowToCheckout(Component): ComponentType {
  return (props: any) => {
    const [store] = useStore();

    const handleClick = (e: any) => {
      e?.preventDefault?.();
      e?.stopPropagation?.();

      const current = window.location.pathname;
      const slugFromPath = current.includes("/upcoming-trips/")
        ? current.split("/").pop() || ""
        : "";

      const tripId = props?.tripId || props?.["data-trip-id"] || store.tripId ||
        "";
      const slug = props?.slug || props?.["data-trip-slug"] || slugFromPath ||
        store.slug || "";

      const next = new URLSearchParams();
      if (tripId) next.set("tripId", tripId);
      if (slug) next.set("slug", slug);
      if (store.date) next.set("date", store.date);
      const travellers = normalizeTravellers(store.travellers || []);
      const firstTransport = travellers[0]?.transport || store.transport;
      if (firstTransport) next.set("vehicle", firstTransport);

      const qs = next.toString();
      window.location.href = qs
        ? `${CHECKOUT_PAGE_URL}?${qs}`
        : CHECKOUT_PAGE_URL;
    };

    return <Component {...props} onClick={handleClick} />;
  };
}

export function withCheckoutTripId(Component): ComponentType {
  return withTextFromState((store) => store.tripId || "\u2014")(Component);
}

export function withCheckoutSelectionText(Component): ComponentType {
  return withTextFromState((store) => {
    const tripName = store.tripName || store.slug || store.tripId ||
      "trip name";
    return `Checkout for ${tripName}`;
  })(Component);
}

export function withTravellerCount(Component): ComponentType {
  return withTextFromState((store) => {
    const count = normalizeTravellers(store?.travellers || []).length;
    return `${count} Traveller${count === 1 ? "" : "s"}`;
  })(Component);
}

export function withCheckoutBackButton(Component): ComponentType {
  return (props: any) => {
    const [store] = useStore();

    const handleClick = (e: any) => {
      e?.preventDefault?.();
      e?.stopPropagation?.();

      const slug = String(store?.slug || "").trim();
      if (slug) {
        window.location.href = `${UPCOMING_TRIPS_BASE_URL}/${slug}`;
        return;
      }

      if (window.history.length > 1) {
        window.history.back();
        return;
      }

      window.location.href = UPCOMING_TRIPS_BASE_URL;
    };

    return <Component {...props} onClick={handleClick} />;
  };
}

export function withCheckoutDateSelect(Component): ComponentType {
  return (props: any) => {
    const [store, setStore] = useStore();
    const wrapperRef = useRef<HTMLDivElement>(null);
    const handleDateChange = (nextDate: string) => {
      const nextTransport = getDefaultTransportForDate(
        store.pricingData || [],
        nextDate,
        store.transport,
      );
      const travellers = sanitizeTravellersForDate(
        store.pricingData || [],
        nextDate,
        normalizeTravellers(store.travellers || []),
        nextTransport,
      );
      setStore(
        applyValidationPatch(store, {
          date: nextDate,
          transport: nextTransport,
          travellers,
          checkoutMessage: "",
        }),
      );
    };
    const handleBlur = (e: any) => {
      const touchedFields = markFieldTouched(store, DEPARTURE_DATE_FIELD);
      setStore(
        applyValidationPatch(store, {
          touchedFields,
          checkoutMessage: "",
        }),
      );
      props?.onBlur?.(e);
    };

    useEffect(() => {
      if (!wrapperRef.current) return;
      const select = wrapperRef.current.querySelector("select") as
        | HTMLSelectElement
        | null;
      if (!select) return;

      const options = getDateOptions(store.pricingData || []);
      const signature = JSON.stringify(options);
      if (select.getAttribute("data-populated") !== signature) {
        populateDropdown(select, options);
        select.setAttribute("data-populated", signature);
      }

      if (store.date && select.value !== store.date) {
        select.value = store.date;
      }
    }, [store.pricingData, store.date, store.transport, store.travellers]);

    return (
      <div ref={wrapperRef} style={{ display: "contents" }}>
        <Component
          {...props}
          value={store.date || ""}
          onValueChange={handleDateChange}
          onChange={(e: any) => handleDateChange(e?.target?.value || "")}
          onBlur={handleBlur}
        />
      </div>
    );
  };
}

export function withCheckoutVehicleSelect(Component): ComponentType {
  return (props: any) => {
    const [store] = useStore();
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      if (!wrapperRef.current) return;
      const select = wrapperRef.current.querySelector("select") as
        | HTMLSelectElement
        | null;
      if (!select) return;

      const options = getTransportOptions(store.pricingData || [], store.date);
      const signature = JSON.stringify(options);
      if (select.getAttribute("data-populated") !== signature) {
        populateDropdown(select, options);
        select.setAttribute("data-populated", signature);
      }
      if (!select.value) select.value = "";
    }, [store.pricingData, store.date]);

    return (
      <div ref={wrapperRef} style={{ display: "contents" }}>
        <Component
          {...props}
          style={{
            ...(props.style || {}),
            display: "none",
            pointerEvents: "none",
          }}
        />
      </div>
    );
  };
}

export function withTravellerList(Component): ComponentType {
  return (props: any) => {
    const [store] = useStore();
    const travellers = normalizeTravellers(store.travellers || []);
    const childrenArray = React.Children.toArray(props.children);
    const template = childrenArray.find((child) =>
      React.isValidElement(child)
    ) as
      | React.ReactElement
      | undefined;

    if (!template) {
      return <Component {...props} />;
    }

    return (
      <Component
        {...props}
        style={{
          ...(props.style || {}),
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        {travellers.map((traveller, index) => {
          const row = React.cloneElement(template, {
            key: `traveller-${traveller.id}`,
            style: {
              ...((template.props as any)?.style || {}),
              width: "100%",
              position: "relative",
            },
          });

          return (
            <TravellerContext.Provider
              key={`traveller-provider-${traveller.id}`}
              value={{ id: traveller.id, index }}
            >
              {row}
            </TravellerContext.Provider>
          );
        })}
      </Component>
    );
  };
}

export function withTravellerLabel(Component): ComponentType {
  return (props: any) => {
    const ctx = useContext(TravellerContext);
    if (!ctx) return <Component {...props} />;
    const text = `TRAVELLER ${ctx.index + 1}`;
    return <Component {...props} text={text} />;
  };
}

export function withTravellerName(Component): ComponentType {
  return (props: any) => {
    const [store, setStore] = useStore();
    const ctx = useContext(TravellerContext);
    if (!ctx) return <Component {...props} />;

    const traveller = getTravellerByContext(store, ctx);
    const handleChange = (value: string) => {
      const next = updateTravellerById(store, ctx.id, { name: value });
      setStore(
        applyValidationPatch(store, {
          travellers: next,
          checkoutMessage: "",
        }),
      );
    };
    const handleBlur = (e: any) => {
      const touchedFields = markFieldTouched(store, travellerFieldKey(ctx.id, "name"));
      setStore(
        applyValidationPatch(store, {
          touchedFields,
          checkoutMessage: "",
        }),
      );
      props?.onBlur?.(e);
    };

    return (
      <Component
        {...props}
        value={traveller?.name || ""}
        onValueChange={handleChange}
        onChange={(e: any) => handleChange(e.target.value)}
        onBlur={handleBlur}
        placeholder="Guest Name"
      />
    );
  };
}

export function withTravellerSharing(Component): ComponentType {
  return (props: any) => {
    const [store, setStore] = useStore();
    const ctx = useContext(TravellerContext);
    const wrapperRef = useRef<HTMLDivElement>(null);

    if (!ctx) return <Component {...props} />;

    const traveller = getTravellerByContext(store, ctx);
    const travellerTransport = traveller?.transport || store.transport || "";
    const options = useMemo(
      () =>
        getSharingOptions(
          store.pricingData || [],
          store.date,
          travellerTransport,
        ),
      [store.pricingData, store.date, travellerTransport],
    );

    const handleChange = (value: string) => {
      const normalized = normalizeSharing(value);
      const next = updateTravellerById(store, ctx.id, { sharing: normalized });
      setStore(
        applyValidationPatch(store, {
          travellers: next,
          checkoutMessage: "",
        }),
      );
    };
    const handleBlur = (e: any) => {
      const touchedFields = markFieldTouched(
        store,
        travellerFieldKey(ctx.id, "sharing"),
      );
      setStore(
        applyValidationPatch(store, {
          touchedFields,
          checkoutMessage: "",
        }),
      );
      props?.onBlur?.(e);
    };

    useEffect(() => {
      if (!wrapperRef.current) return;
      const select = wrapperRef.current.querySelector("select") as
        | HTMLSelectElement
        | null;
      if (!select) return;

      const signature = JSON.stringify(options);
      if (select.getAttribute("data-populated") !== signature) {
        populateDropdown(select, options);
        select.setAttribute("data-populated", signature);
      }
    }, [options, ctx.id]);

    useEffect(() => {
      if (!traveller || traveller.sharing) return;
      const fallback = getDefaultSharingForDate(
        store.pricingData || [],
        store.date,
        travellerTransport,
      );
      if (!fallback) return;
      const next = updateTravellerById(store, ctx.id, { sharing: fallback });
      setStore(
        applyValidationPatch(store, {
          travellers: next,
        }),
      );
    }, [
      ctx.id,
      traveller?.sharing,
      travellerTransport,
      store.pricingData,
      store.date,
    ]);

    return (
      <div ref={wrapperRef} style={{ display: "contents" }}>
        <Component
          {...props}
          value={traveller?.sharing || ""}
          onValueChange={handleChange}
          onChange={(e: any) => handleChange(e?.target?.value || "")}
          onBlur={handleBlur}
        />
      </div>
    );
  };
}

export function withTravellerVehicleSelect(Component): ComponentType {
  return (props: any) => {
    const [store, setStore] = useStore();
    const ctx = useContext(TravellerContext);
    const wrapperRef = useRef<HTMLDivElement>(null);

    if (!ctx) return <Component {...props} />;

    const traveller = getTravellerByContext(store, ctx);
    const options = useMemo(
      () => getTransportOptions(store.pricingData || [], store.date),
      [store.pricingData, store.date],
    );
    const hasMultipleVehicleOptions = options.length > 1;
    const selectedTransport = normalizeTravellerTransport(
      store.pricingData || [],
      store.date,
      traveller?.transport || "",
      store.transport || "",
    );

    const handleChange = (value: string) => {
      const normalized = normalizeTravellerTransport(
        store.pricingData || [],
        store.date,
        value,
        store.transport || "",
      );
      const sharingOptions = getSharingOptions(
        store.pricingData || [],
        store.date,
        normalized,
      );
      const nextSharing =
        traveller?.sharing && sharingOptions.includes(traveller.sharing)
          ? traveller.sharing
          : getDefaultSharingForDate(
            store.pricingData || [],
            store.date,
            normalized,
          );

      const next = updateTravellerById(store, ctx.id, {
        transport: normalized,
        sharing: nextSharing,
      });
      setStore(
        applyValidationPatch(store, {
          travellers: next,
          checkoutMessage: "",
        }),
      );
    };
    const handleBlur = (e: any) => {
      const touchedFields = markFieldTouched(
        store,
        travellerFieldKey(ctx.id, "vehicle"),
      );
      setStore(
        applyValidationPatch(store, {
          touchedFields,
          checkoutMessage: "",
        }),
      );
      props?.onBlur?.(e);
    };

    useEffect(() => {
      if (!wrapperRef.current) return;
      const select = wrapperRef.current.querySelector("select") as
        | HTMLSelectElement
        | null;
      if (!select) return;

      const signature = JSON.stringify(options);
      if (select.getAttribute("data-populated") !== signature) {
        populateDropdown(select, options);
        select.setAttribute("data-populated", signature);
      }
    }, [options, ctx.id]);

    useEffect(() => {
      if (
        traveller &&
        (!traveller.transport || traveller.transport !== selectedTransport)
      ) {
        const next = updateTravellerById(store, ctx.id, {
          transport: selectedTransport,
        });
        setStore(
          applyValidationPatch(store, {
            travellers: next,
          }),
        );
      }
    }, [ctx.id, traveller?.transport, selectedTransport]);

    return (
      <div ref={wrapperRef} style={{ display: "contents" }}>
        <Component
          {...props}
          value={selectedTransport || ""}
          onValueChange={handleChange}
          onChange={(e: any) => handleChange(e?.target?.value || "")}
          onBlur={handleBlur}
          style={{
            ...(props.style || {}),
            ...(hasMultipleVehicleOptions ? {} : {
              display: "none",
              pointerEvents: "none",
            }),
          }}
        />
      </div>
    );
  };
}

export function withRemoveTraveller(Component): ComponentType {
  return (props: any) => {
    const [store, setStore] = useStore();
    const ctx = useContext(TravellerContext);
    if (!ctx) return <Component {...props} />;

    if (ctx.index === 0) {
      return (
        <Component
          {...props}
          style={{ ...(props.style || {}), display: "none" }}
        />
      );
    }

    return (
      <Component
        {...props}
        onClick={(e: any) => {
          e?.preventDefault?.();
          e?.stopPropagation?.();
          const list = removeTravellerById(store, ctx.id);
          setStore(
            applyValidationPatch(store, {
              travellers: list,
              checkoutMessage: "",
            }),
          );
        }}
      />
    );
  };
}

export function withAddTraveller(Component): ComponentType {
  return (props: any) => {
    const [store, setStore] = useStore();

    return (
      <Component
        {...props}
        onClick={(e: any) => {
          e?.preventDefault?.();
          e?.stopPropagation?.();
          const list = normalizeTravellers(store.travellers || []);
          const fallbackTransport = normalizeTravellerTransport(
            store.pricingData || [],
            store.date,
            store.transport || "",
            "",
          );
          const fallbackSharing = getDefaultSharingForDate(
            store.pricingData || [],
            store.date,
            fallbackTransport,
          );
          list.push({
            id: nextTravellerId(store),
            name: "",
            transport: fallbackTransport,
            sharing: fallbackSharing,
          });
          setStore(
            applyValidationPatch(store, {
              travellers: normalizeTravellers(list),
              checkoutMessage: "",
            }),
          );
        }}
      />
    );
  };
}

export function withCheckoutContactName(Component): ComponentType {
  return (props: any) => {
    const [store, setStore] = useStore();
    const handleChange = (value: string) =>
      setStore(
        applyValidationPatch(store, {
          contactName: value,
          checkoutMessage: "",
        }),
      );
    const handleBlur = (e: any) => {
      const touchedFields = markFieldTouched(store, CONTACT_NAME_FIELD);
      setStore(
        applyValidationPatch(store, {
          touchedFields,
          checkoutMessage: "",
        }),
      );
      props?.onBlur?.(e);
    };
    return (
      <Component
        {...props}
        value={store.contactName || ""}
        onValueChange={handleChange}
        onChange={(e: any) => handleChange(e.target.value)}
        onBlur={handleBlur}
      />
    );
  };
}

export function withCheckoutContactPhone(Component): ComponentType {
  return (props: any) => {
    const [store, setStore] = useStore();
    const handleChange = (value: string) =>
      setStore(
        applyValidationPatch(store, {
          contactPhone: String(value || "").replace(/[^\d\s\-+()]/g, ""),
          checkoutMessage: "",
        }),
      );
    const handleBlur = (e: any) => {
      const touchedFields = markFieldTouched(store, CONTACT_PHONE_FIELD);
      setStore(
        applyValidationPatch(store, {
          touchedFields,
          checkoutMessage: "",
        }),
      );
      props?.onBlur?.(e);
    };

    return (
      <Component
        {...props}
        value={store.contactPhone || ""}
        onValueChange={handleChange}
        onChange={(e: any) => handleChange(e.target.value)}
        onBlur={handleBlur}
      />
    );
  };
}

export function withCheckoutContactEmail(Component): ComponentType {
  return (props: any) => {
    const [store, setStore] = useStore();
    const handleChange = (value: string) =>
      setStore(
        applyValidationPatch(store, {
          contactEmail: value,
          checkoutMessage: "",
        }),
      );
    const handleBlur = (e: any) => {
      const touchedFields = markFieldTouched(store, CONTACT_EMAIL_FIELD);
      setStore(
        applyValidationPatch(store, {
          touchedFields,
          checkoutMessage: "",
        }),
      );
      props?.onBlur?.(e);
    };

    return (
      <Component
        {...props}
        value={store.contactEmail || ""}
        onValueChange={handleChange}
        onChange={(e: any) => handleChange(e.target.value)}
        onBlur={handleBlur}
      />
    );
  };
}

export function withCouponCodeInput(Component): ComponentType {
  return (props: any) => {
    const [store, setStore] = useStore();
    const appliedCode = getAppliedCouponCode(store);

    const handleChange = (value: string) => {
      setStore({ couponCode: String(value || "").toUpperCase().trimStart() });
    };

    return (
      <Component
        {...props}
        value={store.couponCode || appliedCode || ""}
        onValueChange={handleChange}
        onChange={(e: any) => handleChange(e.target.value)}
        placeholder="Enter coupon code"
      />
    );
  };
}

export function withApplyCouponButton(Component): ComponentType {
  return (props: any) => {
    const [store, setStore] = useStore();
    const [busy, setBusy] = useState(false);
    const alreadyApplied = hasAppliedCoupon(store);

    if (alreadyApplied) {
      return (
        <Component
          {...props}
          style={{ ...(props.style || {}), display: "none" }}
        />
      );
    }

    const applyCoupon = () => {
      if (store?.inviteOnly) {
        setStore({
          couponMessageType: "error",
          couponMessage: "Coupon is not applicable for invite-only trips.",
          appliedCoupon: null,
        });
        return;
      }

      const code = String(store.couponCode || "").trim().toUpperCase();
      if (!code) {
        setStore({
          couponMessageType: "error",
          couponMessage: "Enter a coupon code",
          appliedCoupon: null,
        });
        return;
      }

      if (!store.tripId || !store.date) {
        setStore({
          couponMessageType: "error",
          couponMessage: "Select trip date before applying coupon",
          appliedCoupon: null,
        });
        return;
      }

      setBusy(true);
      const payload = {
        trip_id: store.tripId,
        departure_date: store.date,
        transport: store.transport || null,
        travellers: normalizeTravellers(store.travellers || []).map((t) => ({
          id: t.id,
          name: t.name,
          sharing: t.sharing,
          transport: t.transport || "",
        })),
        coupon_code: code,
        email: store.contactEmail || "",
      };

      fetchGateway("validate-coupon", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      })
        .then((res) =>
          res.json().catch(() => ({})).then((data) => ({ res, data }))
        )
        .then(({ res, data }) => {
          if (!res.ok || !data?.valid) {
            setStore({
              appliedCoupon: null,
              pricingBreakdown: buildLocalPricingBreakdown({
                ...store,
                appliedCoupon: null,
              }),
              couponMessageType: "error",
              couponMessage: data?.message || data?.error ||
                `Coupon failed (HTTP ${res.status})`,
            });
            if (isFramerRuntimeHost()) console.log("[Checkout] Coupon apply failed", data);
            return;
          }

          const nextBreakdown = buildPricingBreakdownFromQuote(data, store);
          const appliedCode = String(
            data.applied_discount_code || data.code || code || "",
          )
            .trim()
            .toUpperCase();

          setStore({
            appliedCoupon: {
              valid: true,
              code: data.code || code,
              discount_type: data.discount_type,
              discount_value: toNumber(data.discount_value),
              discount_amount: toNumber(data.discount_amount),
              min_subtotal: toNumber(data.min_subtotal),
              coupon_wins: Boolean(data.coupon_wins),
              final_applied_source: data.final_applied_source ||
                data.applied_discount_source || "none",
              base_subtotal: nextBreakdown.base_subtotal,
              early_bird_discount_amount:
                nextBreakdown.early_bird_discount_amount,
              coupon_discount_amount: nextBreakdown.coupon_discount_amount,
              applied_discount_source: nextBreakdown.applied_discount_source,
              applied_discount_code: nextBreakdown.applied_discount_code,
              discount_amount_total: nextBreakdown.discount_amount_total,
              taxable_amount: nextBreakdown.taxable_amount,
              tax_amount: nextBreakdown.tax_amount,
              total_amount: nextBreakdown.total_amount,
              line_items: nextBreakdown.line_items,
              message: data.message,
            },
            couponCode: data.code || code,
            pricingBreakdown: nextBreakdown,
            couponMessageType: "success",
            couponMessage: data.message ||
              (nextBreakdown.early_bird_discount_amount > 0
                ? `Coupon ${appliedCode || data.code || code
                } applied with Early Bird`
                : `Coupon ${appliedCode || data.code || code} applied`),
          });

          if (isFramerRuntimeHost()) console.log("[Checkout] Coupon apply success", data);
        })
        .catch((err: any) => {
          setStore({
            appliedCoupon: null,
            pricingBreakdown: buildLocalPricingBreakdown({
              ...store,
              appliedCoupon: null,
            }),
            couponMessageType: "error",
            couponMessage: "Could not validate coupon",
          });
          if (isFramerRuntimeHost()) console.error("[Checkout] Coupon call error", err);
        })
        .finally(() => {
          setBusy(false);
        });
    };

    return (
      <Component
        {...props}
        text={busy ? "Applying..." : props.text || "Apply"}
        onClick={(e: any) => {
          e?.preventDefault?.();
          e?.stopPropagation?.();
          if (!busy) applyCoupon();
        }}
        style={{
          ...(props.style || {}),
          opacity: busy ? 0.7 : 1,
          cursor: busy ? "wait" : "pointer",
        }}
      />
    );
  };
}

export function withRemoveCouponButton(Component): ComponentType {
  return (props: any) => {
    const [store, setStore] = useStore();
    const visible = hasAppliedCoupon(store);

    if (!visible) {
      return (
        <Component
          {...props}
          style={{ ...(props.style || {}), display: "none" }}
        />
      );
    }

    return (
      <Component
        {...props}
        onClick={(e: any) => {
          e?.preventDefault?.();
          e?.stopPropagation?.();
          setStore({
            appliedCoupon: null,
            pricingBreakdown: buildLocalPricingBreakdown({
              ...store,
              appliedCoupon: null,
            }),
            couponMessageType: "neutral",
            couponMessage: "Coupon removed",
          });
        }}
      />
    );
  };
}

export function withCouponMessage(Component): ComponentType {
  return (props: any) => {
    const [store] = useStore();
    const totals = computeTotals(store);
    let text = store.couponMessage || "Enter a coupon code and tap Apply.";
    const appliedCode = getAppliedCouponCode(store);
    if (appliedCode) {
      text = totals.earlyBirdDiscount > 0
        ? `Coupon ${appliedCode} applied with Early Bird`
        : `Coupon ${appliedCode} applied`;
    }
    return <Component {...props} text={text} />;
  };
}

export function withCheckoutSummaryLineItems(Component): ComponentType {
  return (props: any) => {
    const [store] = useStore();
    const rows = getSummaryLineRows(store);
    const childrenArray = React.Children.toArray(props.children);
    const template = childrenArray.find((child) =>
      React.isValidElement(child)
    ) as
      | React.ReactElement
      | undefined;

    if (!template) return <Component {...props} />;
    if (rows.length === 0) {
      return (
        <Component
          {...props}
          style={{ ...(props.style || {}), display: "none" }}
        />
      );
    }

    return (
      <Component
        {...props}
        style={{
          ...(props.style || {}),
          display: "flex",
          flexDirection: "column",
          gap: "8px",
        }}
      >
        {rows.map((row) => (
          <SummaryLineContext.Provider key={row.key} value={row}>
            {React.cloneElement(template, { key: row.key })}
          </SummaryLineContext.Provider>
        ))}
      </Component>
    );
  };
}

export function withCheckoutSummaryLineLabel(Component): ComponentType {
  return (props: any) => {
    const row = useContext(SummaryLineContext);
    const text = row?.label || props.text || "";
    return <Component {...props} text={text} />;
  };
}

export function withCheckoutSummaryLineAmount(Component): ComponentType {
  return (props: any) => {
    const row = useContext(SummaryLineContext);
    const text = fmtINR(toNumber(row?.amount || 0));
    return <Component {...props} text={text} />;
  };
}

export function withCheckoutSubtotal(Component): ComponentType {
  return withTextFromState((store) => fmtINR(computeTotals(store).subtotal))(
    Component,
  );
}

export function withCheckoutSubtotalLabel(Component): ComponentType {
  return withTextFromState((store) => subtotalLineItemsText(store), "Subtotal")(
    Component,
  );
}

export function withCheckoutDiscount(Component): ComponentType {
  return withTextFromState((store) => {
    const totals = computeTotals(store);
    return `- ${fmtINR(totals.discount)}`;
  })(Component);
}

export function withCheckoutDiscountLabel(Component): ComponentType {
  return withTextFromState((store) => {
    const totals = computeTotals(store);
    const source = String(totals.appliedDiscountSource || "").toLowerCase();
    if (
      (source === "coupon" || source === "both" || totals.couponDiscount > 0) &&
      totals.appliedDiscountCode
    ) {
      return `Coupon (${totals.appliedDiscountCode})`;
    }
    if (totals.earlyBirdDiscount > 0) return "Early Bird";
    return "Discount";
  })(Component);
}

export function withCheckoutCouponCode(Component): ComponentType {
  return (props: any) => {
    const [store] = useStore();
    const totals = computeTotals(store);
    const source = String(totals.appliedDiscountSource || "").toLowerCase();
    const couponAmount = totals.couponDiscount > 0
      ? totals.couponDiscount
      : (source === "coupon" || source === "both")
        ? totals.discount
        : 0;
    const hasCoupon = couponAmount > 0;
    if (!hasCoupon) {
      return (
        <Component
          {...props}
          text=""
          style={{ ...(props.style || {}), display: "none" }}
        />
      );
    }
    return <Component {...props} text={`- ${fmtINR(couponAmount)}`} />;
  };
}

export function withCouponCode(Component): ComponentType {
  return withCheckoutCouponCode(Component);
}

export function withDiscountAmount(Component): ComponentType {
  return withCheckoutDiscount(Component);
}

export function withTransportOption(Component): ComponentType {
  return withTextFromState((store) => store.transport || "Seat in Coach")(
    Component,
  );
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

export function withCheckoutTax(Component): ComponentType {
  return withTextFromState((store) => fmtINR(computeTotals(store).tax))(
    Component,
  );
}

export function withCheckoutTaxLabel(Component): ComponentType {
  return withTextFromState(() => "Tax (5%)")(Component);
}

export function withCheckoutTaxValue(Component): ComponentType {
  return withTextFromState((store) => fmtINR(computeTotals(store).tax))(
    Component,
  );
}

export function withCheckoutTotal(Component): ComponentType {
  return withTextFromState((store) => fmtINR(computeTotals(store).payableNow))(
    Component,
  );
}

export function withCheckoutValidationHint(Component): ComponentType {
  return (props: any) => {
    const [store] = useStore();
    const validation = getValidationState(store);
    const message = String(
      store.checkoutMessage ||
      (store.validationSubmitAttempted ? validation.globalErrors[0] || "" : ""),
    ).trim();

    if (!message) {
      return (
        <Component
          {...props}
          text=""
          style={{ ...(props.style || {}), display: "none" }}
        />
      );
    }
    return <Component {...props} text={message} style={props.style} />;
  };
}

function withFieldErrorText(fieldKeyResolver: (store: CheckoutStore) => string) {
  return function (Component: ComponentType): ComponentType {
    return (props: any) => {
      const [store] = useStore();
      const fieldKey = fieldKeyResolver(store);
      const text = getVisibleFieldError(store, fieldKey);
      if (!text) {
        return (
          <Component
            {...props}
            text=""
            style={{ ...(props.style || {}), display: "none" }}
          />
        );
      }
      return <Component {...props} text={text} style={props.style} />;
    };
  };
}

export function withCheckoutNameError(Component): ComponentType {
  return withFieldErrorText(() => CONTACT_NAME_FIELD)(Component);
}

export function withCheckoutPhoneError(Component): ComponentType {
  return withFieldErrorText(() => CONTACT_PHONE_FIELD)(Component);
}

export function withCheckoutEmailError(Component): ComponentType {
  return withFieldErrorText(() => CONTACT_EMAIL_FIELD)(Component);
}

export function withTravellerNameError(Component): ComponentType {
  return (props: any) => {
    const [store] = useStore();
    const ctx = useContext(TravellerContext);
    if (!ctx) {
      return (
        <Component
          {...props}
          text=""
          style={{ ...(props.style || {}), display: "none" }}
        />
      );
    }
    const text = getVisibleFieldError(store, travellerFieldKey(ctx.id, "name"));
    if (!text) {
      return (
        <Component
          {...props}
          text=""
          style={{ ...(props.style || {}), display: "none" }}
        />
      );
    }
    return <Component {...props} text={text} style={props.style} />;
  };
}

export function withTravellerSharingError(Component): ComponentType {
  return (props: any) => {
    const [store] = useStore();
    const ctx = useContext(TravellerContext);
    if (!ctx) {
      return (
        <Component
          {...props}
          text=""
          style={{ ...(props.style || {}), display: "none" }}
        />
      );
    }
    const text = getVisibleFieldError(
      store,
      travellerFieldKey(ctx.id, "sharing"),
    );
    if (!text) {
      return (
        <Component
          {...props}
          text=""
          style={{ ...(props.style || {}), display: "none" }}
        />
      );
    }
    return <Component {...props} text={text} style={props.style} />;
  };
}

export function withTravellerVehicleError(Component): ComponentType {
  return (props: any) => {
    const [store] = useStore();
    const ctx = useContext(TravellerContext);
    if (!ctx) {
      return (
        <Component
          {...props}
          text=""
          style={{ ...(props.style || {}), display: "none" }}
        />
      );
    }
    const text = getVisibleFieldError(
      store,
      travellerFieldKey(ctx.id, "vehicle"),
    );
    if (!text) {
      return (
        <Component
          {...props}
          text=""
          style={{ ...(props.style || {}), display: "none" }}
        />
      );
    }
    return <Component {...props} text={text} style={props.style} />;
  };
}

function inferPaymentModeFromProps(props: any): PaymentMode {
  const text = [
    props?.text,
    props?.label,
    props?.title,
    props?.name,
    props?.id,
    props?.pnMgUuoPi,
    props?.["aria-label"],
    props?.ariaLabel,
    props?.children,
  ]
    .map((entry) => readNodeText(entry))
    .join(" ")
    .toLowerCase();

  if (
    /25\s*%/.test(text) || /\bdeposit\b/.test(text) || /\bpartial\b/.test(text)
  ) {
    return "partial_25";
  }
  return "full";
}

export function withCheckoutPaymentMode(Component): ComponentType {
  return (props: any) => {
    const [store, setStore] = useStore();
    const isHydrated = useHydrated();
    const modeFromProps = inferPaymentModeFromProps(props);
    const isSelected = isHydrated
      ? (store?.paymentMode || "full") === modeFromProps
      : false;

    const setModeToThis = () => setStore({ paymentMode: modeFromProps });

    return (
      <Component
        {...props}
        checked={isSelected}
        onValueChange={setModeToThis}
        onChange={(e: any) => {
          const checked = e?.target?.checked;
          if (typeof checked === "boolean" && checked) {
            setModeToThis();
          } else if (e?.target?.value) {
            setModeToThis();
          }
        }}
        onClick={(e: any) => {
          props?.onClick?.(e);
          setModeToThis();
        }}
        aria-pressed={isSelected}
        role="radio"
        aria-checked={isSelected}
        data-active={isSelected ? "true" : "false"}
        style={{
          ...(props.style || {}),
          cursor: "pointer",
          userSelect: "none",
          transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
          borderRadius: props.style?.borderRadius || "12px",
          ...(isSelected
            ? {
              backgroundColor: "#1b91c9",
              borderColor: "#1b91c9",
              borderWidth: "1px",
              borderStyle: "solid",
              color: "#ffffff",
              WebkitTextFillColor: "white",
              boxShadow: "0 2px 8px rgba(27, 145, 201, 0.3)",
              fontWeight: "600",
            }
            : {
              backgroundColor: "transparent",
              borderColor: "transparent",
              borderWidth: "1px",
              borderStyle: "solid",
              color: "#494D4D",
              WebkitTextFillColor: "inherit",
              fontWeight: "500",
            }),
        }}
      />
    );
  };
}

export function withCheckoutPayableNow(Component): ComponentType {
  return withTextFromState((store) => fmtINR(computeTotals(store).payableNow))(
    Component,
  );
}

export function withCheckoutDueAmount(Component): ComponentType {
  return withTextFromState((store) => fmtINR(computeTotals(store).dueAmount))(
    Component,
  );
}

export function withCheckoutHideWhenNoDue(Component): ComponentType {
  return (props: any) => {
    const [store] = useStore();
    const isHydrated = useHydrated();
    const due = isHydrated ? computeTotals(store).dueAmount : 0;
    if (due <= 0) {
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

export function withCheckoutPaymentModeHint(Component): ComponentType {
  return withTextFromState((store) => {
    const totals = computeTotals(store);
    if (totals.paymentMode === "partial_25") {
      return "Pay a 25% deposit now. The remaining balance is collected on-site before departure.";
    }
    return "Pay full amount now for instant paid-in-full confirmation.";
  })(Component);
}

export function withCheckoutHideWhenNoCoupon(Component): ComponentType {
  return (props: any) => {
    const [store] = useStore();
    const isHydrated = useHydrated();
    const totals = computeTotals(store);
    const source = String(totals.appliedDiscountSource || "").toLowerCase();
    const hasCouponAmount = totals.couponDiscount > 0 ||
      ((source === "coupon" || source === "both") && totals.discount > 0);
    const hasCoupon = isHydrated && hasCouponAmount;

    if (!hasCoupon) {
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

export function withCheckoutHideWhenNoDiscount(Component): ComponentType {
  return (props: any) => {
    const [store] = useStore();
    const isHydrated = useHydrated();
    const hasDiscount = isHydrated ? computeTotals(store).discount > 0 : false;

    if (!hasDiscount) {
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

export function withCheckoutPayButton(Component): ComponentType {
  return (props: any) => {
    const [store, setStore] = useStore();
    const totals = computeTotals(store);
    const currentValidation = getValidationState(store);
    const isValid = currentValidation.globalErrors.length === 0 &&
      Object.keys(currentValidation.fieldErrors).length === 0;

    const submit = () => {
      if (store.submitting) return;

      const fallbackName = readInputValue([
        'input[name="contact_name"]',
        'input[name="name"]',
        'input[placeholder*="name" i]',
      ]);
      const fallbackPhone = readInputValue([
        'input[name="contact_phone"]',
        'input[name="phone"]',
        'input[type="tel"]',
        'input[placeholder*="phone" i]',
        'input[placeholder*="number" i]',
      ]);
      const fallbackEmail = readInputValue([
        'input[name="contact_email"]',
        'input[name="email"]',
        'input[type="email"]',
        'input[placeholder*="email" i]',
      ]);

      const contactName = firstNonEmpty(store.contactName, fallbackName);
      const contactPhone = firstNonEmpty(store.contactPhone, fallbackPhone);
      const contactEmail = firstNonEmpty(store.contactEmail, fallbackEmail);
      const hydratedStore = {
        ...store,
        contactName,
        contactPhone,
        contactEmail,
      } as CheckoutStore;
      const touchedFields = buildAllTouchedFields(hydratedStore);
      const validation = getValidationState(hydratedStore);
      const hasValidationErrors = validation.globalErrors.length > 0 ||
        Object.keys(validation.fieldErrors).length > 0;

      if (hasValidationErrors) {
        setStore({
          contactName,
          contactPhone,
          contactEmail,
          touchedFields,
          validationSubmitAttempted: true,
          fieldErrors: validation.fieldErrors,
          checkoutMessage: validation.globalErrors[0] || "",
        });
        return;
      }

      if (store?.inviteOnly) {
        setStore({
          touchedFields,
          validationSubmitAttempted: true,
          fieldErrors: validation.fieldErrors,
          checkoutMessage:
            "This trip is invite-only. Please contact support to book.",
        });
        return;
      }

      setStore({
        submitting: true,
        contactName,
        contactPhone,
        contactEmail,
        touchedFields,
        validationSubmitAttempted: true,
        fieldErrors: validation.fieldErrors,
        checkoutMessage: "",
      });
      if (isFramerRuntimeHost()) {
        console.log("[Checkout] Pay initiated", {
          tripId: store.tripId,
          date: store.date,
          transport: store.transport,
          coupon: store.appliedCoupon?.code || null,
          total: totals.total,
          paymentMode: totals.paymentMode,
          payableNow: totals.payableNow,
          dueAmount: totals.dueAmount,
        });
      }

      const normalizedTravellers = normalizeTravellers(store.travellers || [])
        .map((t) => ({
          id: t.id,
          name: String(t.name || "").trim(),
          sharing: String(t.sharing || "").trim(),
          transport: String(t.transport || "").trim(),
        }));

      const payload = {
        trip_id: store.tripId,
        date: store.date,
        departure_date: store.date,
        transport: store.transport || null,
        travellers: normalizedTravellers,
        traveller_details: normalizedTravellers,
        travellers_count: normalizedTravellers.length,
        name: contactName,
        email: contactEmail,
        phone: contactPhone,
        amount: totals.payableNow,
        total_amount: totals.total,
        payable_now_amount: totals.payableNow,
        due_amount: totals.dueAmount,
        tax_amount: totals.tax,
        payment_breakdown: totals.breakdown,
        currency: "INR",
        created_at: new Date().toISOString(),
        payment_mode: totals.paymentMode,
        coupon_code: store.appliedCoupon?.code || null,
        pricing_snapshot: {
          subtotal_amount: totals.subtotal,
          discount_amount: totals.discount,
          applied_discount_source: totals.appliedDiscountSource,
          applied_discount_code: totals.appliedDiscountCode,
          tax_amount: totals.tax,
          total_amount: totals.total,
          payable_now_amount: totals.payableNow,
          due_amount: totals.dueAmount,
          payment_mode: totals.paymentMode,
        },
      };

      const headers = { "Content-Type": "application/json" };

      const executeCreateBooking = (body: string, isJson: boolean = true) => {
        const fetchCall = fetchGateway("create-booking", {
          method: "POST",
          headers: {
            ...headers,
            "Content-Type": isJson
              ? "application/json"
              : "application/x-www-form-urlencoded",
          },
          body,
        });

        return fetchCall
          .then((res) => {
            return res.json().then((data) => ({ res, data }));
          })
          .then(({ res, data }) => {
            const legacyMissingFieldsError = typeof data?.error === "string" &&
              (data.error.includes(
                "Missing required fields (trip_id, date, travellers, amount, email, name)",
              ) ||
                data.error.includes(
                  "Missing required fields (trip_id, departure_date, travellers, name, email)",
                ));

            if (!res.ok && legacyMissingFieldsError && isJson) {
              const form = new URLSearchParams();
              form.set("trip_id", String(payload.trip_id || ""));
              form.set("date", String(payload.date || ""));
              form.set("departure_date", String(payload.departure_date || ""));
              form.set("amount", String(payload.amount || ""));
              form.set("email", String(payload.email || ""));
              form.set("name", String(payload.name || ""));
              form.set("phone", String(payload.phone || ""));
              form.set("transport", String(payload.transport || ""));
              form.set("travellers", JSON.stringify(payload.travellers || []));
              form.set("payment_mode", String(payload.payment_mode || "full"));
              form.set("coupon_code", String(payload.coupon_code || ""));
              form.set(
                "pricing_snapshot",
                JSON.stringify(payload.pricing_snapshot || {}),
              );
              return executeCreateBooking(form.toString(), false);
            }

            if (!res.ok) {
              if (isFramerRuntimeHost()) {
                console.error("[Checkout] create-booking failed", {
                  status: res.status,
                  payload,
                  response: data,
                });
              }
              setStore({
                submitting: false,
                checkoutMessage: data?.error ||
                  `Payment setup failed (HTTP ${res.status})`,
              });
              return;
            }

            if (data?.gateway === "razorpay" && data?.razorpay?.order_id) {
              ensureRazorpayScript()
                .then(() => {
                  const razorpay = data.razorpay;
                  if (
                    typeof (window as any).Razorpay !== "function" ||
                    !razorpay?.key ||
                    !razorpay?.order_id
                  ) {
                    throw new Error("Invalid Razorpay payload");
                  }

                  const rzp = new (window as any).Razorpay({
                    key: String(razorpay.key),
                    amount: Number(razorpay.amount || 0),
                    currency: String(razorpay.currency || "INR"),
                    name: String(razorpay.name || "Trip With Nomads"),
                    description: String(razorpay.description || "Trip Booking"),
                    order_id: String(razorpay.order_id),
                    prefill: razorpay.prefill || {},
                    notes: razorpay.notes || {},
                    callback_url: String(razorpay.callback_url || ""),
                    redirect: true,
                    modal: {
                      ondismiss: () => {
                        setStore({
                          submitting: false,
                          checkoutMessage: "Payment was cancelled before completion.",
                        });
                      },
                    },
                  });
                  rzp.on("payment.failed", () => {
                    setStore({
                      submitting: false,
                      checkoutMessage: "Payment failed. Please try again.",
                    });
                  });
                  rzp.open();
                })
                .catch((err) => {
                  if (isFramerRuntimeHost()) {
                    console.error("[Checkout] Razorpay launch error", err);
                  }
                  setStore({
                    submitting: false,
                    checkoutMessage: "Could not start payment",
                  });
                });
              return;
            }

            const payu = data?.payu;
            if (!payu?.action) {
              setStore({
                submitting: false,
                checkoutMessage: "Payment gateway payload missing",
              });
              return;
            }

            const form = document.createElement("form");
            form.method = "POST";
            form.action = payu.action;

            Object.entries(payu).forEach(([key, value]) => {
              if (key === "action") return;
              const input = document.createElement("input");
              input.type = "hidden";
              input.name = key;
              input.value = String(value);
              form.appendChild(input);
            });

            document.body.appendChild(form);
            form.submit();
          })
          .catch((err) => {
            if (isFramerRuntimeHost()) console.error("[Checkout] pay error", err);
            setStore({
              submitting: false,
              checkoutMessage: "Could not start payment",
            });
          });
      };

      executeCreateBooking(JSON.stringify(payload));
    };

    return (
      <div style={{ position: "relative", width: "100%" }}>
        <Component
          {...props}
          text={store?.submitting
            ? "Processing..."
            : `Pay ${fmtINR(totals.payableNow)} now`}
          onClick={submit}
          style={{
            ...(props.style || {}),
            width: "100%",
            opacity: isValid ? 1 : 0.6,
            cursor: isValid ? "pointer" : "not-allowed",
          }}
        />
        {!isValid && (
          <div
            onClick={(e: any) => {
              e?.preventDefault?.();
              e?.stopPropagation?.();
              const touchedFields = buildAllTouchedFields(store);
              const validation = getValidationState(store);
              setStore({
                touchedFields,
                validationSubmitAttempted: true,
                fieldErrors: validation.fieldErrors,
                checkoutMessage: validation.globalErrors[0] || "",
              });
            }}
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 10,
              cursor: "not-allowed",
            }}
          />
        )}
      </div>
    );
  };
}

function getTripSlugFromPathname(pathname: string): string {
  // Pass the full pathname so normalizeSlug's internal /upcoming-trips/ regex
  // can detect URL origin and allow single-word slugs via the fromUrl exception.
  return normalizeSlug(pathname);
}

function normalizeSlug(value: any): string {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";

  const fromUrl = raw.match(/\/upcoming-trips\/([^/?#]+)/i);
  const candidate = fromUrl?.[1] ? decodeURIComponent(fromUrl[1]) : raw;
  if (candidate.startsWith("framer-")) return "";
  if (UUID_REGEX.test(candidate)) return "";
  // Reject purely numeric values
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
    for (const key of TRIP_ID_PROP_KEYS) {
      const found = findSlugInCmsProps((value as any)?.[key], depth + 1);
      if (found) return found;
    }
    for (const key of Object.keys(value as any)) {
      if (DEEP_SCAN_SKIP_KEYS.has(key)) continue;
      const found = findSlugInCmsProps((value as any)[key], depth + 1);
      if (found) return found;
    }
  }
  return "";
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
      if (DEEP_SCAN_SKIP_KEYS.has(key)) continue;
      const found = findTripIdInValue((value as any)[key], depth + 1);
      if (found) return found;
    }
  }
  return "";
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

  return findSlugInCmsProps(props);
}

export function withTripIdSource(Component): ComponentType {
  return (props: any) => {
    const nextTripId = readTripIdCandidate(props);
    const nextSlug = readTripSlugCandidate(props);

    useEffect(() => {
      if (nextTripId && typeof window !== "undefined") {
        const path = String(window.location.pathname || "").toLowerCase();
        const onCheckoutPage = path.startsWith("/checkout");
        if (onCheckoutPage) return;
        forcedTripId = nextTripId;
        window.dispatchEvent(
          new CustomEvent(TRIP_ID_SOURCE_EVENT, { detail: { tripId: nextTripId, slug: nextSlug } }),
        );
      }
    }, [nextTripId, nextSlug]);

    return <Component {...props} />;
  };
}

function useTripDisplayData(props?: any) {
  const [data, setData] = useState<any>(null);
  const [forcedFromSource, setForcedFromSource] = useState<string>(() =>
    normalizeTripId(forcedTripId)
  );
  const [forcedSlugFromSource, setForcedSlugFromSource] = useState<string>("");
  const propTripId = readTripIdCandidate(props);
  const propSlug = readTripSlugCandidate(props);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = (event?: Event) => {
      const detail = (event as CustomEvent)?.detail;
      const fromEventTripId = typeof detail === "object" ? detail?.tripId : detail;
      const fromEventSlug = typeof detail === "object" ? detail?.slug : "";

      const nextTripId = normalizeTripId(fromEventTripId) || normalizeTripId(forcedTripId);
      setForcedFromSource((prev) => (prev === nextTripId ? prev : nextTripId));

      const nextSlug = normalizeSlug(fromEventSlug);
      setForcedSlugFromSource((prev) => (prev === nextSlug ? prev : nextSlug));
    };
    window.addEventListener(TRIP_ID_SOURCE_EVENT, sync as EventListener);
    sync();
    return () => {
      window.removeEventListener(TRIP_ID_SOURCE_EVENT, sync as EventListener);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let disposed = false;
    const query = new URLSearchParams(window.location.search);
    const path = String(window.location.pathname || "");
    const onCheckoutPage = path.toLowerCase().startsWith("/checkout");
    const slugFromPath = getTripSlugFromPathname(path);
    const slug = normalizeSlug(
      onCheckoutPage
        ? (query.get("slug") || propSlug || slugFromPath || "")
        : (propSlug || forcedSlugFromSource || slugFromPath || "")
    );
    const tripId = onCheckoutPage
      ? normalizeTripId(propTripId || query.get("tripId") || query.get("trip_id") || "")
      : normalizeTripId(propTripId || forcedFromSource || forcedTripId || "");
    const selectedDate = String(query.get("date") || "").trim();

    fetchTripDisplayPrice({ slug, tripId, date: selectedDate })
      .then((payload) => {
        if (disposed) return;
        setData(payload);
      })
      .catch(() => {
        if (disposed) return;
        setData(null);
      });

    return () => {
      disposed = true;
    };
  }, [propTripId, propSlug, forcedFromSource, forcedSlugFromSource]);

  return data;
}

export function withTripPrimaryPrice(Component): ComponentType {
  return (props: any) => {
    const isHydrated = useHydrated();
    const tripData = useTripDisplayData(props);
    if (!isHydrated) {
      return <Component {...props} text="" visible={false} />;
    }
    const payable = toNumber(tripData?.display_summary?.payable_price);
    if (payable <= 0) return <Component {...props} text="" visible={false} />;
    const summary = tripData?.display_summary;
    const value = toNumber(summary?.payable_price);
    const text = value > 0 ? fmtINR(value) : "";
    return <Component {...props} text={text} visible={value > 0} />;
  };
}

export function withTripStrikePrice(Component): ComponentType {
  return (props: any) => {
    const isHydrated = useHydrated();
    const tripData = useTripDisplayData(props);
    const summary = tripData?.display_summary;
    const base = toNumber(summary?.base_price);
    const payable = toNumber(summary?.payable_price);
    const hasDiscount =
      isHydrated &&
      Boolean(summary?.has_discount) &&
      base > payable &&
      payable > 0;
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
    const isHydrated = useHydrated();
    const tripData = useTripDisplayData(props);
    const summary = tripData?.display_summary;
    const save = toNumber(summary?.save_amount);
    const hasDiscount = isHydrated && Boolean(summary?.has_discount) && save > 0;
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
    const isHydrated = useHydrated();
    const tripData = useTripDisplayData(props);
    const summary = tripData?.display_summary;
    const hasDiscount =
      isHydrated &&
      Boolean(summary?.has_discount) &&
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
    const isHydrated = useHydrated();
    const tripData = useTripDisplayData(props);
    const payable = toNumber(tripData?.display_summary?.payable_price);
    if (!isHydrated || payable <= 0) {
      return <Component {...props} text="" />;
    }
    const text = "Starts from";
    return <Component {...props} text={text} />;
  };
}

export function withTripNextBatchText(Component): ComponentType {
  return (props: any) => {
    const isHydrated = useHydrated();
    const tripData = useTripDisplayData(props);
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
