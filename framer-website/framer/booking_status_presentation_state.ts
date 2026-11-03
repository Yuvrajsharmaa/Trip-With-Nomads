export type BookingStatusView =
  | "checking"
  | "pending"
  | "unavailable"
  | "success"
  | "failed";

export type BookingStatusCopyState =
  | "loading"
  | "pending"
  | "unavailable"
  | "details";

export function bookingStatusDetailsReady(booking: unknown): boolean {
  if (!booking || typeof booking !== "object") return false;
  const data = booking as Record<string, any>;
  const travellers = data.travellers;
  const rawTotal = data.total_amount;
  const total = Number(data.total_amount);
  const tax = Number(data.tax_amount);

  return Boolean(
    String(data.id || "").trim() &&
      String(data.trip_title || "").trim() &&
      String(data.departure_date || "").trim() &&
      String(data.currency || "").trim() &&
      Array.isArray(travellers) &&
      travellers.length > 0 &&
      travellers.every((traveller: any) =>
        String(traveller?.name || "").trim() &&
        String(traveller?.sharing || "").trim()
      ) &&
      rawTotal !== null && rawTotal !== undefined && rawTotal !== "" &&
      Number.isFinite(total) && total >= 0 &&
      Number.isFinite(tax) && tax >= 0,
  );
}

export function shouldShowBookingStatusContent(
  started: boolean,
  view: BookingStatusView,
): boolean {
  return started && (view === "success" || view === "failed");
}

export function shouldShowPendingPaymentRetry(
  started: boolean,
  view: BookingStatusView,
  retryAvailable: boolean,
): boolean {
  return started && view === "pending" && retryAvailable;
}

export function bookingStatusCopy(state: BookingStatusCopyState) {
  if (state === "pending") {
    return {
      title: "Your payment is still processing",
      description:
        "Your bank may still be processing it. Check the status before trying another payment.",
    };
  }
  if (state === "unavailable") {
    return {
      title: "We can’t confirm your payment yet",
      description:
        "Check again before making another payment, or contact us if your account was charged.",
    };
  }
  if (state === "details") {
    return {
      title: "Your booking details are taking longer",
      description:
        "We’ve received a payment update. Refresh to load your booking, or contact us if your account was charged.",
    };
  }
  return {
    title: "Your trip is getting ready",
    description:
      "We’re confirming your payment with the bank. Your booking details will appear here once it’s confirmed. Please keep this page open and don’t try again yet.",
  };
}

export function bookingStatusView(
  loadState: "loading" | "pending" | "ready" | "error",
  paymentStatus?: string,
  detailsReady = true,
): BookingStatusView {
  if (loadState === "error") return "unavailable";
  if (loadState === "loading" || loadState === "pending") {
    return "checking";
  }
  const status = String(paymentStatus || "").trim().toLowerCase();
  if (status === "pending") return "pending";
  if (status === "paid" || status === "succeeded" || status === "failed") {
    if (!detailsReady) return "checking";
    return status === "failed" ? "failed" : "success";
  }
  return "unavailable";
}

export function verifiedStatusDestination(
  paymentStatus?: string,
): string | null {
  const status = String(paymentStatus || "").trim().toLowerCase();
  if (status === "paid" || status === "succeeded") return "/payment-success";
  if (status === "failed") return "/payment-failed";
  return null;
}
