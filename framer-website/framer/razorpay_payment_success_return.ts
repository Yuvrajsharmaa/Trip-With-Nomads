export function buildRazorpayPaymentStatusUrl(
  siteBaseUrl: string,
  bookingId: string,
  statusToken: string,
  path: "payment-success" | "payment-failed",
): string | null {
  const id = String(bookingId || "").trim();
  const token = String(statusToken || "").trim();
  if (!id || !token) return null;

  const base = String(siteBaseUrl || "").trim().replace(/\/+$/, "");
  if (!base) return null;
  const url = new URL(`/${path}`, `${base}/`);
  url.searchParams.set("booking_id", id);
  url.searchParams.set("status_token", token);
  return url.toString();
}
