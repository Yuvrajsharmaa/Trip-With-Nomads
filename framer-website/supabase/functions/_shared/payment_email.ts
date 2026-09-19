export type PaymentEmailBooking = {
  id?: unknown;
  booking_ref?: unknown;
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  departure_date?: unknown;
  trip_type?: unknown;
  tripType?: unknown;
  transport?: unknown;
  travellers?: unknown;
  payment_breakdown?: unknown;
  subtotal_amount?: unknown;
  discount_amount?: unknown;
  coupon_code?: unknown;
  tax_amount?: unknown;
  total_amount?: unknown;
  currency?: unknown;
  payable_now_amount?: unknown;
  paid_amount?: unknown;
  due_amount?: unknown;
  payment_status?: unknown;
  settlement_status?: unknown;
  payment_mode?: unknown;
  payment_gateway_txn_id?: unknown;
};

export type PaymentEmailContent = {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
  headers?: Record<string, string>;
};

type TravellerDetail = {
  name: string;
  variant: string;
  transport: string;
};

type SelectionDetail = {
  count: number;
  variant: string;
  transport: string;
  amount: number;
};

const EMAIL_LOGO_URL =
  "https://framerusercontent.com/images/FR1lBzx4w9xp2fecFXEMUGGul4.png?width=364&height=229";
const SUPPORT_EMAIL = "support@tripwithnomads.com";
const WHATSAPP_PHONE = "919318405401";
const BRAND_BLUE = "#08b1ff";
const BRAND_NAVY = "#0b3550";
const REGISTERED_OFFICE =
  "Near Old Capital Bus Stand Holi Gate, 2nd Floor, Shop No-07, Ballabgargh, Faridabad, Haryana, 121004";

function text(value: unknown): string {
  return String(value || "").trim();
}

function number(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function positiveCount(value: unknown): number {
  return Math.max(0, Math.round(number(value)));
}

function escapeHtml(value: unknown): string {
  return text(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeEmail(value: unknown): string {
  const email = text(value).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function normalizeHttpUrl(value: unknown, fallback: string): string {
  const raw = text(value);
  if (!raw) return fallback;

  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return fallback;
    return raw.replace(/\/$/, "");
  } catch {
    return fallback;
  }
}

function formatAmount(value: unknown): string {
  return "₹" + number(value).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(value: unknown): string {
  const raw = text(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return raw;

  const date = new Date(raw + "T00:00:00+05:30");
  if (Number.isNaN(date.getTime())) return raw;

  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function normalizedStatus(value: unknown): string {
  return text(value).toLowerCase();
}

function normalizedSettlement(value: unknown): string {
  return text(value).toLowerCase();
}

function normalizeVariant(value: unknown): string {
  const raw = text(value);
  const lower = raw.toLowerCase();
  if (lower.includes("quad")) return "Quad";
  if (lower.includes("triple")) return "Triple";
  if (lower.includes("double")) return "Double";
  return raw;
}

function normalizeTransport(value: unknown): string {
  return text(value);
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return value.slice(0, Math.max(0, maxLength - 3)).trim() + "...";
}

function paymentStateChanged(
  previous: PaymentEmailBooking,
  next: PaymentEmailBooking,
): boolean {
  const previousStatus = normalizedStatus(previous.payment_status);
  const nextStatus = normalizedStatus(next.payment_status);
  const previousSettlement = normalizedSettlement(previous.settlement_status);
  const nextSettlement = normalizedSettlement(next.settlement_status);
  const previousTransaction = text(previous.payment_gateway_txn_id);
  const nextTransaction = text(next.payment_gateway_txn_id);

  return previousStatus !== nextStatus ||
    previousSettlement !== nextSettlement ||
    (nextStatus === "paid" && previousTransaction !== nextTransaction);
}

function statusLabel(booking: PaymentEmailBooking): string {
  const status = normalizedStatus(booking.payment_status);
  const settlement = normalizedSettlement(booking.settlement_status);
  if (status === "paid" && settlement === "partially_paid") {
    return "Advance payment received";
  }
  if (status === "paid") return "Payment received";
  if (status === "failed") return "Payment not completed";
  return "Payment update";
}

function paymentModeLabel(booking: PaymentEmailBooking): string {
  return normalizedStatus(booking.payment_mode) === "partial_25"
    ? "25% advance payment"
    : "Pay in full";
}

function buildTravellerDetails(
  booking: PaymentEmailBooking,
): TravellerDetail[] {
  const travellers = Array.isArray(booking.travellers)
    ? booking.travellers
    : [];
  return travellers
    .map((traveller: any, index) => ({
      name: text(traveller?.name) || "Traveller " + (index + 1),
      variant: normalizeVariant(
        traveller?.sharing || traveller?.variant || traveller?.variant_name,
      ),
      transport: normalizeTransport(traveller?.transport || traveller?.vehicle),
    }))
    .filter((traveller) =>
      Boolean(traveller.name || traveller.variant || traveller.transport)
    );
}

function buildSelectionDetails(
  booking: PaymentEmailBooking,
): SelectionDetail[] {
  const breakdown = Array.isArray(booking.payment_breakdown)
    ? booking.payment_breakdown
    : [];

  const fromBreakdown = breakdown
    .map((item: any) => {
      const count = Math.max(1, positiveCount(item?.count || 1));
      const variant = normalizeVariant(
        item?.variant || item?.sharing || item?.variant_name || item?.label,
      );
      const transport = normalizeTransport(item?.transport || item?.vehicle);
      const unitPrice = number(item?.unit_price);
      const amount = number(item?.price) || unitPrice * count;
      return { count, variant, transport, amount };
    })
    .filter((item) => Boolean(item.variant || item.transport));

  if (fromBreakdown.length > 0) return fromBreakdown;

  const grouped = new Map<string, SelectionDetail>();
  for (const traveller of buildTravellerDetails(booking)) {
    const key = traveller.variant + "::" + traveller.transport;
    const current = grouped.get(key) || {
      count: 0,
      variant: traveller.variant,
      transport: traveller.transport,
      amount: 0,
    };
    current.count += 1;
    grouped.set(key, current);
  }
  return [...grouped.values()];
}

function selectionLabel(selection: SelectionDetail): string {
  return String(selection.count) + " x " + (selection.variant || "Traveller") +
    (selection.transport ? " | " + selection.transport : "");
}

function detailRow(label: string, value: string, emphasis = false): string {
  return "<tr>" +
    '<td style="padding:7px 0;color:#5e7d8d;font-size:14px;vertical-align:top;">' +
    escapeHtml(label) +
    "</td>" +
    '<td style="padding:7px 0;color:' + BRAND_NAVY +
    ";font-size:14px;text-align:right;font-weight:" +
    (emphasis ? "700" : "500") +
    ';vertical-align:top;">' +
    escapeHtml(value) +
    "</td>" +
    "</tr>";
}

function sectionLabel(label: string): string {
  return '<p style="margin:0 0 10px;color:#157aa9;font-size:11px;font-weight:700;letter-spacing:.08em;line-height:1.4;text-transform:uppercase;">' +
    escapeHtml(label) +
    "</p>";
}

function buildWhatsAppUrl(bookingRef: string): string {
  const message = "Hi Trip With Nomads, I need help with booking " +
    bookingRef +
    ".";
  return "https://wa.me/" + WHATSAPP_PHONE + "?text=" +
    encodeURIComponent(message);
}

function buildUnsubscribeUrl(): string {
  return "mailto:" + SUPPORT_EMAIL + "?subject=" +
    encodeURIComponent("Unsubscribe from Trip With Nomads emails");
}

function footerLink(label: string, url: string): string {
  return '<a href="' + escapeHtml(url) +
    '" style="color:#0b3550;text-decoration:underline;">' +
    escapeHtml(label) + "</a>";
}

export function buildPaymentEmail(
  previous: PaymentEmailBooking,
  next: PaymentEmailBooking,
  tripTitle: string,
  websiteUrl = "https://tripwithnomads.com",
  retryUrl = "",
): PaymentEmailContent | null {
  const to = normalizeEmail(next.email);
  const bookingId = text(next.id);
  const bookingRef = text(next.booking_ref) || bookingId.slice(0, 8);
  const paymentStatus = normalizedStatus(next.payment_status);

  if (!to || !bookingId || !paymentStateChanged(previous, next)) return null;
  if (paymentStatus !== "paid" && paymentStatus !== "failed") return null;

  const recipientName = text(next.name) || "there";
  const trip = text(tripTitle) || "your Trip With Nomads trip";
  const tripType = text(next.trip_type) || text(next.tripType);
  const tripDescriptor = tripType ? " (Trip Type: " + tripType + ")" : "";
  const departureDate = formatDate(next.departure_date) || "Not specified";
  const label = statusLabel(next);
  const paymentMode = paymentModeLabel(next);
  const isPaid = paymentStatus === "paid";
  const isPartial =
    normalizedSettlement(next.settlement_status) === "partially_paid";
  const transactionId = text(next.payment_gateway_txn_id);
  const settlement = normalizedSettlement(next.settlement_status) || "unknown";
  const paxDetails = buildTravellerDetails(next);
  const selectionDetails = buildSelectionDetails(next);
  const paxCount = paxDetails.length ||
    selectionDetails.reduce((total, item) => total + item.count, 0);
  const paxLabel = String(paxCount) + " pax";
  const subjectTrip = truncate(trip.replace(/\|/g, "-"), 56);
  const subject = isPaid
    ? (isPartial ? "Advance received: " : "Booking confirmed: ") + subjectTrip +
      " | " + bookingRef
    : "Action needed: complete payment | " + bookingRef;
  const dueAmount = number(next.due_amount);
  const intro = isPaid
    ? isPartial
      ? "We are glad to confirm your booking for " + trip + tripDescriptor +
        ". Your advance payment has been received and your place is reserved."
      : "We are delighted to inform you that your booking for " + trip +
        tripDescriptor + " has been successfully confirmed."
    : "We could not complete your payment for " + trip +
      ". Your booking is not confirmed yet.";
  const bookingGuidance = isPaid
    ? isPartial && dueAmount > 0
      ? "Please review the booking summary below, including your traveller details, selected variant, and pending amount of " +
        formatAmount(dueAmount) +
        ". The remaining amount should be cleared at least 14 days before your travel date."
      : "Please review the booking summary below, including your traveller details, selected variant, and payment information."
    : "Please review the booking summary below. If you have any questions or concerns, reply to this email or contact us on WhatsApp. We are here to assist you.";
  const closingCopy = isPaid
    ? "Thank you for choosing Trip With Nomads. We look forward to welcoming you on your trip."
    : "";
  const animationFallback = isPaid ? "✓" : "×";
  const nextStep = isPaid
    ? isPartial && dueAmount > 0
      ? "Balance due before departure: " + formatAmount(dueAmount) + "."
      : "Your booking payment is complete. Keep this email for your records."
    : "Use the button below to try payment again. If checkout still does not work, reply to this email.";
  const normalizedWebsiteUrl = normalizeHttpUrl(
    websiteUrl,
    "https://tripwithnomads.com",
  );
  const normalizedRetryUrl = normalizeHttpUrl(retryUrl, normalizedWebsiteUrl);
  const actionUrl = isPaid ? normalizedWebsiteUrl : normalizedRetryUrl;
  const actionLabel = isPaid ? "Visit Trip With Nomads" : "Try payment again";
  const statusColor = isPaid ? BRAND_NAVY : "#9b473f";
  const preheader = isPaid
    ? label + " for " + trip + ". Booking " + bookingRef + "."
    : "Payment action needed for booking " + bookingRef + ".";
  const whatsappUrl = buildWhatsAppUrl(bookingRef);
  const unsubscribeUrl = buildUnsubscribeUrl();
  const privacyUrl = normalizedWebsiteUrl + "/privacy-policy";
  const termsUrl = normalizedWebsiteUrl + "/terms-and-conditions";
  const cancellationUrl = normalizedWebsiteUrl + "/cancellation-refund-policy";

  const travellerRowsHtml = paxDetails.length > 0
    ? paxDetails.map((traveller) => {
      const meta = [traveller.variant, traveller.transport].filter(Boolean)
        .join(" | ");
      return "<tr>" +
        '<td style="padding:8px 0;border-bottom:1px solid #dceef7;color:' +
        BRAND_NAVY + ';font-size:14px;font-weight:600;">' +
        escapeHtml(traveller.name) +
        "</td>" +
        '<td style="padding:8px 0;border-bottom:1px solid #dceef7;color:#5e7d8d;font-size:13px;text-align:right;">' +
        escapeHtml(meta || "Selection recorded") +
        "</td>" +
        "</tr>";
    }).join("")
    : '<tr><td colspan="2" style="padding:8px 0;color:#5e7d8d;font-size:14px;">Selection details are recorded with your booking.</td></tr>';

  const selectionRowsHtml = selectionDetails.length > 0
    ? selectionDetails.map((selection) => {
      return "<tr>" +
        '<td style="padding:7px 0;color:' + BRAND_NAVY + ';font-size:14px;">' +
        escapeHtml(selectionLabel(selection)) +
        "</td>" +
        '<td style="padding:7px 0;color:' + BRAND_NAVY +
        ';font-size:14px;text-align:right;font-weight:600;">' +
        (selection.amount > 0
          ? escapeHtml(formatAmount(selection.amount))
          : "") +
        "</td>" +
        "</tr>";
    }).join("")
    : '<tr><td colspan="2" style="padding:7px 0;color:#5e7d8d;font-size:14px;">No variant breakdown available.</td></tr>';

  const subtotalAmount = number(next.subtotal_amount);
  const discountAmount = number(next.discount_amount);
  const taxAmount = number(next.tax_amount);
  const totalAmount = number(next.total_amount);
  const payableNowAmount = number(next.payable_now_amount) || totalAmount;
  const couponCode = text(next.coupon_code);
  const paymentRows = [
    ...(subtotalAmount > 0
      ? [detailRow("Subtotal", formatAmount(subtotalAmount))]
      : []),
    ...(discountAmount > 0
      ? [
        detailRow(
          "Discount" + (couponCode ? " (" + couponCode + ")" : ""),
          "-" + formatAmount(discountAmount),
        ),
      ]
      : []),
    ...(taxAmount > 0 ? [detailRow("Tax", formatAmount(taxAmount))] : []),
    detailRow("Trip total", formatAmount(totalAmount), true),
    isPaid
      ? detailRow("Paid amount", formatAmount(next.paid_amount), true)
      : detailRow("Payment attempt", formatAmount(payableNowAmount), true),
    ...(isPaid && dueAmount > 0
      ? [detailRow("Balance due", formatAmount(dueAmount), true)]
      : []),
    ...(isPaid && transactionId
      ? [detailRow("Payment reference", transactionId)]
      : []),
  ].join("");

  const travellerRowsText = paxDetails.length > 0
    ? paxDetails.map((traveller) => {
      const meta = [traveller.variant, traveller.transport].filter(Boolean)
        .join(" | ");
      return "- " + traveller.name + (meta ? " | " + meta : "");
    })
    : ["- Selection details are recorded with your booking."];
  const selectionRowsText = selectionDetails.length > 0
    ? selectionDetails.map((selection) => {
      const amount = selection.amount > 0
        ? ": " + formatAmount(selection.amount)
        : "";
      return "- " + selectionLabel(selection) + amount;
    })
    : ["- No variant breakdown available."];

  const textBody = [
    "Trip With Nomads",
    label,
    "",
    "Hi " + recipientName + ",",
    intro,
    bookingGuidance,
    "",
    "Booking reference: " + bookingRef,
    "Trip: " + trip,
    "Departure: " + departureDate,
    "Pax: " + paxLabel,
    "",
    "Travellers:",
    ...travellerRowsText,
    "",
    "Selections:",
    ...selectionRowsText,
    "",
    "Payment:",
    "Payment type: " + paymentMode,
    ...(subtotalAmount > 0
      ? ["Subtotal: " + formatAmount(subtotalAmount)]
      : []),
    ...(discountAmount > 0
      ? [
        "Discount" + (couponCode ? " (" + couponCode + ")" : "") + ": -" +
        formatAmount(discountAmount),
      ]
      : []),
    ...(taxAmount > 0 ? ["Tax: " + formatAmount(taxAmount)] : []),
    "Trip total: " + formatAmount(totalAmount),
    isPaid
      ? "Paid amount: " + formatAmount(next.paid_amount)
      : "Payment attempt: " + formatAmount(payableNowAmount),
    ...(isPaid && dueAmount > 0
      ? ["Balance due: " + formatAmount(dueAmount)]
      : []),
    ...(isPaid && transactionId ? ["Payment reference: " + transactionId] : []),
    ...(isPaid && isPartial && dueAmount > 0
      ? [
        "",
        "Important payment information:",
        "Pending amount: " + formatAmount(dueAmount),
        "The pending amount must be cleared at least 14 days prior to your travel date.",
        "Make any further payment only to the official Nomads Travel Club bank account. Trip With Nomads is not responsible for payments made to personal accounts or third parties.",
        "Bank details:",
        "Account name: Nomads Travel Club",
        "Account number: 50200112404512",
        "IFSC code: HDFC0011600",
        "Bank: HDFC Bank",
      ]
      : []),
    "",
    nextStep,
    ...(closingCopy ? [closingCopy] : []),
    actionLabel + ": " + actionUrl,
    "",
    "Need help? Chat on WhatsApp: " + whatsappUrl,
    "Questions? Reply to " + SUPPORT_EMAIL + ".",
    "",
    "Privacy policy: " + privacyUrl,
    "Terms and conditions: " + termsUrl,
    "Cancellation and refund policy: " + cancellationUrl,
    "Unsubscribe from non-essential updates: " + unsubscribeUrl,
    "",
    "Trip With Nomads",
    "Registered office: " + REGISTERED_OFFICE,
    "Booking and payment messages may still be sent when needed to manage your reservation.",
  ].join("\n");

  const logoHtml = '<a href="' + escapeHtml(normalizedWebsiteUrl) +
    '" style="display:inline-block;text-decoration:none;">' +
    '<img src="' +
    escapeHtml(EMAIL_LOGO_URL) +
    '" alt="Trip With Nomads" width="96" style="display:block;width:96px;height:60px;object-fit:contain;object-position:left center;border:0;">' +
    "</a>";
  const legalLinks = [
    footerLink("Privacy policy", privacyUrl),
    footerLink("Terms and conditions", termsUrl),
    footerLink("Cancellation policy", cancellationUrl),
    footerLink("Unsubscribe", unsubscribeUrl),
  ].join(' <span style="color:#70bddd;">|</span> ');
  const pendingPaymentHtml = isPaid && isPartial && dueAmount > 0
    ? [
      '<div style="margin:24px 0 0;padding-top:18px;border-top:1px solid #dceef7;">',
      '<p style="margin:0 0 8px;color:' + BRAND_NAVY +
      ';font-size:14px;font-weight:700;line-height:1.4;">Important payment information</p>',
      '<p style="margin:0 0 10px;color:#355d73;font-size:13px;line-height:1.55;">Pending amount: ' +
      escapeHtml(formatAmount(dueAmount)) +
      ". Please clear it at least 14 days before your travel date.</p>",
      '<p style="margin:0 0 10px;color:#355d73;font-size:13px;line-height:1.55;">Please make any further payment only to the official Nomads Travel Club bank account. Trip With Nomads is not responsible for payments made to personal accounts or third parties.</p>',
      '<p style="margin:0;color:#355d73;font-size:13px;line-height:1.65;"><strong>Bank details</strong><br>Account name: Nomads Travel Club<br>Account number: 50200112404512<br>IFSC code: HDFC0011600<br>Bank: HDFC Bank</p>',
      "</div>",
    ].join("\n")
    : "";

  const htmlBody = [
    "<!doctype html>",
    '<html lang="en">',
    '  <head><meta charset="UTF-8"></head>',
    '  <body style="margin:0;background:#ffffff;color:' + BRAND_NAVY +
    ';font-family:Arial,Helvetica,sans-serif;line-height:1.5;">',
    '    <span style="display:none!important;max-height:0;overflow:hidden;opacity:0;color:transparent;">' +
    escapeHtml(preheader) + "</span>",
    '    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;background:#ffffff;">',
    "      <tr>",
    '        <td align="center" style="padding:22px 12px;">',
    '          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;border-collapse:separate;background:#ffffff;border:1px solid #cbeafa;border-radius:16px;overflow:hidden;">',
    "            <tr>",
    '              <td style="padding:12px 24px 8px;border-bottom:1px solid #e5f3fa;">',
    '                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">',
    "                  <tr>",
    '                    <td style="width:65%;vertical-align:top;">' +
    logoHtml + "</td>",
    '                    <td align="right" style="padding-top:20px;vertical-align:top;">',
    '                      <a href="' + escapeHtml(whatsappUrl) +
    '" style="color:' + BRAND_NAVY +
    ';font-size:12px;font-weight:700;text-decoration:underline;">WhatsApp</a>',
    "                    </td>",
    "                  </tr>",
    "                </table>",
    "              </td>",
    "            </tr>",
    "            <tr>",
    '              <td style="padding:24px 24px 8px;">',
    '                <div data-payment-animation="status" data-animation-loop="' +
    (isPaid ? "false" : "true") +
    '" style="width:120px;height:112px;margin:0 auto 14px;text-align:center;">',
    '                  <span class="payment-animation-fallback" style="display:inline-block;width:72px;height:72px;margin-top:14px;border:2px solid ' +
    statusColor + ";border-radius:50%;color:" + statusColor +
    ';font-size:40px;font-weight:700;line-height:72px;">' +
    escapeHtml(animationFallback) + "</span>",
    "                </div>",
    '                <h2 style="margin:0 0 4px;color:' + BRAND_NAVY +
    ';font-size:22px;line-height:1.3;">Hi ' +
    escapeHtml(recipientName) + ",</h2>",
    '                <p style="margin:0;color:#5e7d8d;font-size:14px;line-height:1.5;">' +
    escapeHtml(intro) + "</p>",
    '                <p style="margin:12px 0 0;color:#355d73;font-size:14px;line-height:1.55;">' +
    escapeHtml(bookingGuidance) + "</p>",
    '                <div style="height:22px;line-height:22px;">&nbsp;</div>',
    "                " + sectionLabel("Your trip"),
    '                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;background:#f6fcff;border:1px solid #dceef7;border-radius:12px;">',
    "                  <tr>",
    '                    <td style="padding:15px 16px;">',
    '                      <h3 style="margin:0 0 4px;color:' + BRAND_NAVY +
    ';font-size:19px;line-height:1.3;">' +
    escapeHtml(trip) + "</h3>",
    '                      <p style="margin:0;color:#5e7d8d;font-size:14px;">' +
    escapeHtml(departureDate) + "</p>",
    "                    </td>",
    '                    <td align="right" style="padding:15px 16px;vertical-align:middle;">',
    '                      <p style="margin:0;color:#157aa9;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">Travellers</p>',
    '                      <p style="margin:2px 0 0;color:' + BRAND_NAVY +
    ';font-size:17px;font-weight:700;">' +
    escapeHtml(paxLabel) + "</p>",
    "                    </td>",
    "                  </tr>",
    "                </table>",
    '                <div style="height:22px;line-height:22px;">&nbsp;</div>',
    "                " + sectionLabel("Booking details"),
    '                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">',
    "                  " + detailRow("Booking reference", bookingRef, true),
    "                  " + detailRow("Payment type", paymentMode),
    "                </table>",
    '                <div style="height:22px;line-height:22px;">&nbsp;</div>',
    "                " + sectionLabel("Travellers"),
    '                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">',
    "                  " + travellerRowsHtml,
    "                </table>",
    '                <div style="height:22px;line-height:22px;">&nbsp;</div>',
    "                " + sectionLabel("Variant selections"),
    '                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">',
    "                  " + selectionRowsHtml,
    "                </table>",
    '                <div style="height:22px;line-height:22px;">&nbsp;</div>',
    "                " + sectionLabel("Payment summary"),
    '                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;background:#f6fcff;border:1px solid #dceef7;border-radius:12px;">',
    '                  <tr><td style="padding:10px 14px;">',
    '                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">',
    "                      " + paymentRows,
    "                    </table>",
    "                  </td></tr>",
    "                </table>",
    "                " + pendingPaymentHtml,
    '                <div style="height:24px;line-height:24px;">&nbsp;</div>',
    '                <p style="margin:0 0 18px;color:#355d73;font-size:14px;line-height:1.55;">' +
    escapeHtml(nextStep) + "</p>",
    closingCopy
      ? '                <p style="margin:0 0 18px;color:#355d73;font-size:14px;line-height:1.55;">' +
        escapeHtml(closingCopy) + "</p>"
      : "",
    '                <table role="presentation" cellpadding="0" cellspacing="0" border="0">',
    "                  <tr>",
    '                    <td style="border-radius:10px;background:' +
    BRAND_NAVY + ';">',
    '                      <a href="' + escapeHtml(actionUrl) +
    '" style="display:inline-block;padding:13px 18px;border:1px solid ' +
    BRAND_NAVY +
    ';border-radius:10px;color:#ffffff;font-size:14px;font-weight:700;line-height:1.2;text-decoration:none;">' +
    escapeHtml(actionLabel) + "</a>",
    "                    </td>",
    "                  </tr>",
    "                </table>",
    "              </td>",
    "            </tr>",
    "            <tr>",
    '              <td style="padding:28px 26px 30px;background:#ffffff;background:linear-gradient(180deg,#ffffff 0%,#08b1ff 100%);border-top:1px solid #cbeafa;color:' +
    BRAND_NAVY +
    ';">',
    '                <p style="margin:0 0 6px;color:' + BRAND_NAVY +
    ';font-size:16px;font-weight:700;line-height:1.4;">Need help with your booking?</p>',
    '                <p style="margin:0 0 16px;color:#23536a;font-size:13px;line-height:1.55;">Our team is here to help with payment, traveller details, or your trip plan.</p>',
    '                <table role="presentation" cellpadding="0" cellspacing="0" border="0">',
    "                  <tr>",
    '                    <td style="border-radius:10px;background:' +
    BRAND_BLUE + ';">',
    '                      <a href="' + escapeHtml(whatsappUrl) +
    '" style="display:inline-block;padding:11px 15px;border:1px solid ' +
    BRAND_BLUE +
    ";border-radius:10px;color:" + BRAND_NAVY +
    ';font-size:13px;font-weight:700;line-height:1.2;text-decoration:none;">Chat on WhatsApp</a>',
    "                    </td>",
    "                  </tr>",
    "                </table>",
    '                <p style="margin:18px 0 0;color:#174e6a;font-size:12px;line-height:1.6;">Reply to this email or contact <a href="mailto:' +
    SUPPORT_EMAIL + '" style="color:' + BRAND_NAVY +
    ';text-decoration:underline;">' +
    SUPPORT_EMAIL + "</a>.</p>",
    '                <p style="margin:16px 0 0;color:#174e6a;font-size:11px;line-height:1.6;">Trip With Nomads<br>Registered office: ' +
    escapeHtml(REGISTERED_OFFICE) + "</p>",
    '                <p style="margin:16px 0 0;color:' + BRAND_NAVY +
    ';font-size:11px;line-height:1.7;">' +
    legalLinks + "</p>",
    '                <p style="margin:12px 0 0;color:#174e6a;font-size:10px;line-height:1.5;">You are receiving this service email because you made a booking or payment request. Booking and payment messages may still be sent when needed to manage your reservation.</p>',
    "              </td>",
    "            </tr>",
    "          </table>",
    "        </td>",
    "      </tr>",
    "    </table>",
    "  </body>",
    "</html>",
  ].join("\n");

  return {
    to,
    subject,
    html: htmlBody,
    text: textBody,
    idempotencyKey: "payment-" + paymentStatus + "-" + settlement + "-" +
      bookingId + "-" + (transactionId || "unknown"),
    headers: {
      "List-Unsubscribe": "<" + unsubscribeUrl + ">",
    },
  };
}
