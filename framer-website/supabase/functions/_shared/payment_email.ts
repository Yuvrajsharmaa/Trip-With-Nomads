export type PaymentEmailBooking = {
  id?: unknown;
  booking_ref?: unknown;
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  departure_date?: unknown;
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
    '<td style="padding:7px 0;color:#6b7d76;font-size:14px;vertical-align:top;">' +
    escapeHtml(label) +
    "</td>" +
    '<td style="padding:7px 0;color:#17332b;font-size:14px;text-align:right;font-weight:' +
    (emphasis ? "700" : "500") +
    ';vertical-align:top;">' +
    escapeHtml(value) +
    "</td>" +
    "</tr>";
}

function sectionLabel(label: string): string {
  return '<p style="margin:0 0 10px;color:#5d756c;font-size:11px;font-weight:700;letter-spacing:.09em;line-height:1.4;text-transform:uppercase;">' +
    escapeHtml(label) +
    "</p>";
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
  const intro = isPaid
    ? isPartial
      ? "Your advance payment for " + trip + " has been received."
      : "Your payment for " + trip + " has been received."
    : "We could not complete your payment for " + trip +
      ". Your booking is not confirmed yet.";
  const dueAmount = number(next.due_amount);
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
  const statusColor = isPaid ? "#008a62" : "#a64b3f";
  const statusSurface = isPaid ? "#e7f6ef" : "#fff0ec";
  const statusBorder = isPaid ? "#b9e5d1" : "#f2c8bf";
  const preheader = isPaid
    ? label + " for " + trip + ". Booking " + bookingRef + "."
    : "Payment action needed for booking " + bookingRef + ".";

  const travellerRowsHtml = paxDetails.length > 0
    ? paxDetails.map((traveller) => {
      const meta = [traveller.variant, traveller.transport].filter(Boolean)
        .join(" | ");
      return "<tr>" +
        '<td style="padding:8px 0;border-bottom:1px solid #edf2ef;color:#17332b;font-size:14px;font-weight:600;">' +
        escapeHtml(traveller.name) +
        "</td>" +
        '<td style="padding:8px 0;border-bottom:1px solid #edf2ef;color:#6b7d76;font-size:13px;text-align:right;">' +
        escapeHtml(meta || "Selection recorded") +
        "</td>" +
        "</tr>";
    }).join("")
    : '<tr><td colspan="2" style="padding:8px 0;color:#6b7d76;font-size:14px;">Selection details are recorded with your booking.</td></tr>';

  const selectionRowsHtml = selectionDetails.length > 0
    ? selectionDetails.map((selection) => {
      return "<tr>" +
        '<td style="padding:7px 0;color:#17332b;font-size:14px;">' +
        escapeHtml(selectionLabel(selection)) +
        "</td>" +
        '<td style="padding:7px 0;color:#17332b;font-size:14px;text-align:right;font-weight:600;">' +
        (selection.amount > 0
          ? escapeHtml(formatAmount(selection.amount))
          : "") +
        "</td>" +
        "</tr>";
    }).join("")
    : '<tr><td colspan="2" style="padding:7px 0;color:#6b7d76;font-size:14px;">No variant breakdown available.</td></tr>';

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
    "",
    nextStep,
    actionLabel + ": " + actionUrl,
    "",
    "Questions? Reply to this email or contact support@tripwithnomads.com.",
    "",
    "Trip With Nomads",
  ].join("\n");

  const htmlBody = [
    "<!doctype html>",
    '<html lang="en">',
    '  <head><meta charset="UTF-8"></head>',
    '  <body style="margin:0;background:#edf4f1;color:#17332b;font-family:Arial,Helvetica,sans-serif;line-height:1.5;">',
    '    <span style="display:none!important;max-height:0;overflow:hidden;opacity:0;color:transparent;">' +
    escapeHtml(preheader) + "</span>",
    '    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;background:#edf4f1;">',
    "      <tr>",
    '        <td align="center" style="padding:24px 12px;">',
    '          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;border-collapse:separate;background:#ffffff;border:1px solid #d6e5df;border-radius:16px;overflow:hidden;">',
    "            <tr>",
    '              <td style="padding:24px 28px 18px;border-bottom:1px solid #e5eeea;">',
    '                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">',
    "                  <tr>",
    '                    <td style="color:#008a62;font-size:13px;font-weight:700;letter-spacing:.08em;line-height:1.4;text-transform:uppercase;">Trip With Nomads</td>',
    '                    <td align="right" style="color:#6b7d76;font-size:11px;font-weight:700;letter-spacing:.08em;line-height:1.4;text-transform:uppercase;">Payment update</td>',
    "                  </tr>",
    "                </table>",
    "              </td>",
    "            </tr>",
    "            <tr>",
    '              <td style="padding:28px;">',
    '                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;background:' +
    statusSurface + ";border:1px solid " + statusBorder +
    ";border-left:4px solid " + statusColor + ';border-radius:10px;">',
    "                  <tr>",
    '                    <td style="padding:18px 18px 17px;">',
    '                      <p style="margin:0 0 8px;color:' + statusColor +
    ';font-size:12px;font-weight:700;letter-spacing:.08em;line-height:1.4;text-transform:uppercase;">' +
    escapeHtml(label) + "</p>",
    '                      <h1 style="margin:0;color:#17332b;font-size:25px;font-weight:700;line-height:1.2;">' +
    escapeHtml(
      isPaid ? "Your booking payment is updated" : "A payment action is needed",
    ) + "</h1>",
    '                      <p style="margin:10px 0 0;color:#486158;font-size:15px;line-height:1.55;">' +
    escapeHtml(intro) + "</p>",
    "                    </td>",
    "                  </tr>",
    "                </table>",
    '                <div style="height:24px;line-height:24px;">&nbsp;</div>',
    "                " + sectionLabel("Your trip"),
    '                <h2 style="margin:0 0 4px;color:#17332b;font-size:20px;line-height:1.3;">' +
    escapeHtml(trip) + "</h2>",
    '                <p style="margin:0;color:#6b7d76;font-size:14px;">' +
    escapeHtml(departureDate) + ' <span style="color:#9aaba4;">|</span> ' +
    escapeHtml(paxLabel) + "</p>",
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
    '                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">',
    "                  " + paymentRows,
    "                </table>",
    '                <div style="height:24px;line-height:24px;">&nbsp;</div>',
    '                <p style="margin:0 0 18px;color:#486158;font-size:14px;line-height:1.55;">' +
    escapeHtml(nextStep) + "</p>",
    '                <table role="presentation" cellpadding="0" cellspacing="0" border="0">',
    "                  <tr>",
    '                    <td style="border-radius:10px;background:#00a873;">',
    '                      <a href="' + escapeHtml(actionUrl) +
    '" style="display:inline-block;padding:13px 18px;border:1px solid #00a873;border-radius:10px;color:#ffffff;font-size:14px;font-weight:700;line-height:1.2;text-decoration:none;">' +
    escapeHtml(actionLabel) + "</a>",
    "                    </td>",
    "                  </tr>",
    "                </table>",
    "              </td>",
    "            </tr>",
    "            <tr>",
    '              <td style="padding:18px 28px 24px;border-top:1px solid #e5eeea;color:#6b7d76;font-size:12px;line-height:1.55;">',
    '                Questions? Reply to this email or contact <a href="mailto:support@tripwithnomads.com" style="color:#008a62;text-decoration:underline;">support@tripwithnomads.com</a>.',
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
  };
}
