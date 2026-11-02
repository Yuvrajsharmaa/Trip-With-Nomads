export type AbandonedCheckoutEmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
  headers: Record<string, string>;
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FRAMER_PREVIEW_HOST = /^maroon-aside-814100--[a-z0-9-]+\.framer\.app$/;

export function isValidCheckoutReminderToken(value: unknown): boolean {
  return UUID.test(String(value ?? ""));
}

function clean(value: unknown, max = 160): string {
  return String(value ?? "").replace(/[\r\n\0]/g, " ").trim().slice(0, max);
}

function escapeHtml(value: unknown): string {
  return clean(value).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;");
}

function isAllowedSiteUrl(value: string): URL {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  const allowedHost = host === "tripwithnomads.com" ||
    host === "www.tripwithnomads.com" ||
    host === "maroon-aside-814100.framer.app" ||
    FRAMER_PREVIEW_HOST.test(host) || host === "localhost" ||
    host === "127.0.0.1";
  const local = host === "localhost" || host === "127.0.0.1";
  if (
    !allowedHost || url.username || url.password || url.search || url.hash ||
    (url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
    url.port || (url.pathname !== "/" && url.pathname !== "")
  ) {
    throw new TypeError("Checkout reminder site URL is not allowed");
  }
  return url;
}

export function nextReminderNumber(sentCount: number): 1 | 2 | null {
  if (sentCount === 0) return 1;
  if (sentCount === 1) return 2;
  return null;
}

export function isCheckoutReminderDeliveryEnabled(
  mode: unknown,
  allowedRecipients: string[],
): boolean {
  const normalizedMode = String(mode ?? "").trim().toLowerCase();
  if (normalizedMode === "live") return true;
  return normalizedMode === "test" &&
    allowedRecipients.some((email) =>
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(email, 254))
    );
}

export function isCheckoutReminderRecipientAllowed(
  mode: unknown,
  email: unknown,
  allowedRecipients: string[],
): boolean {
  const recipient = clean(email, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) return false;
  const normalizedMode = String(mode ?? "").trim().toLowerCase();
  if (normalizedMode === "live") return true;
  return normalizedMode === "test" &&
    allowedRecipients.some((allowed) =>
      clean(allowed, 254).toLowerCase() === recipient
    );
}

export function buildCheckoutResumeUrl(params: {
  siteUrl: string;
  tripId: string;
  tripSlug: string;
}): string {
  const tripId = clean(params.tripId, 64);
  const tripSlug = clean(params.tripSlug, 120);
  if (!UUID.test(tripId) || !SLUG.test(tripSlug)) {
    throw new TypeError("Checkout reminder trip details are invalid");
  }
  const url = new URL("/checkout", isAllowedSiteUrl(params.siteUrl));
  url.searchParams.set("tripId", tripId);
  url.searchParams.set("slug", tripSlug);
  return url.toString();
}

export function isAuthorizedCheckoutReminder(
  suppliedSecret: string | null | undefined,
  configuredSecret: string | null | undefined,
): boolean {
  return Boolean(
    configuredSecret && suppliedSecret && suppliedSecret === configuredSecret,
  );
}

export function buildAbandonedCheckoutEmail(params: {
  sequenceId: string;
  reminderNumber: 1 | 2;
  email: string;
  name?: string;
  tripName: string;
  resumeUrl: string;
  unsubscribeUrl: string;
}): AbandonedCheckoutEmail {
  const to = clean(params.email, 254).toLowerCase();
  const name = clean(params.name, 80) || "there";
  const tripName = clean(params.tripName) || "your trip";
  const subjectTrip = clean(tripName, 56);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || !UUID.test(params.sequenceId)) {
    throw new TypeError("Checkout reminder recipient is invalid");
  }
  const resume = new URL(params.resumeUrl);
  if (
    resume.username || resume.password || resume.hash ||
    !isAllowedSiteUrl(`${resume.origin}/`) ||
    resume.pathname !== "/checkout" ||
    resume.searchParams.size !== 2 || !resume.searchParams.get("tripId") ||
    !UUID.test(resume.searchParams.get("tripId") || "") ||
    !SLUG.test(resume.searchParams.get("slug") || "")
  ) {
    throw new TypeError("Checkout reminder URL is invalid");
  }
  const unsubscribe = new URL(params.unsubscribeUrl);
  if (
    unsubscribe.protocol !== "https:" || unsubscribe.username ||
    unsubscribe.password ||
    unsubscribe.pathname !== "/functions/v1/checkout-reminders" ||
    unsubscribe.searchParams.size !== 1 ||
    !isValidCheckoutReminderToken(unsubscribe.searchParams.get("token"))
  ) {
    throw new TypeError("Checkout unsubscribe URL is invalid");
  }

  const subject = params.reminderNumber === 1
    ? `Your ${subjectTrip} adventure is calling`
    : `One last nudge for ${subjectTrip}`;
  const message = params.reminderNumber === 1
    ? `Good news: we’ve made room for you in our daydreams of the ${tripName} crew. Your checkout details are saved, but your seat isn’t confirmed until payment is complete. Work can wait; this adventure is calling. Finish checkout to make it official.`
    : `One last little nudge: we’ve still got you in our daydreams of the ${tripName} crew. Your seat isn’t held until payment is complete, and availability can change. If you’re in, finish checkout to make it official. If plans have changed, no worries — you can ignore this note.`;
  const logoUrl =
    "https://framerusercontent.com/images/FR1lBzx4w9xp2fecFXEMUGGul4.png?width=364&height=229";
  const safeLogo = escapeHtml(logoUrl);
  const safeResume = escapeHtml(resume.toString());
  const safeUnsubscribe = escapeHtml(unsubscribe.toString());
  const text = [
    `Hi ${name},`,
    "",
    message,
    "",
    "Make it official: " + resume.toString(),
    "",
    "You’re receiving this because you entered your email while checking out with Trip With Nomads.",
    "Stop these checkout reminders: " + unsubscribe.toString(),
    "",
    "With wanderlust,",
    "Your Nomads crew",
  ].join("\n");

  return {
    to,
    subject,
    text,
    html:
      `<!doctype html><html lang="en"><body style="margin:0;background:#fff;color:#0b3550;font-family:Arial,Helvetica,sans-serif;line-height:1.55"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:20px 8px"><table role="presentation" width="600" style="width:100%;max-width:600px"><tr><td><a href="https://tripwithnomads.com" style="display:inline-block;margin:0 0 20px;text-decoration:none"><img src="${safeLogo}" alt="Trip With Nomads" width="96" style="display:block;width:96px;height:60px;object-fit:contain;object-position:left center;border:0"></a><p style="margin:0 0 12px">Hi ${
        escapeHtml(name)
      },</p><p style="margin:0 0 24px">${
        escapeHtml(message)
      }</p><p style="margin:0 0 28px"><a href="${safeResume}" style="display:inline-block;background:#08b1ff;border-radius:10px;padding:13px 18px;color:#0b3550;font-weight:700;text-decoration:none">Make it official</a></p><p style="margin:0 0 12px;color:#5e7d8d;font-size:12px">You’re receiving this because you entered your email while checking out with Trip With Nomads.</p><p style="margin:0;color:#5e7d8d;font-size:12px"><a href="${safeUnsubscribe}" style="color:#0b3550">Stop these checkout reminders</a></p><p style="margin:24px 0 0;color:#5e7d8d;font-size:12px">With wanderlust,<br>Your Nomads crew</p></td></tr></table></td></tr></table></body></html>`,
    idempotencyKey:
      `abandoned-checkout:${params.sequenceId}:${params.reminderNumber}`,
    headers: {
      "List-Unsubscribe": `<${unsubscribe.toString()}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}
