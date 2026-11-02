const FRAMER_PREVIEW_HOST = /^maroon-aside-814100--[a-z0-9-]+\.framer\.app$/;

// shortcut: origin plus the database cooldown limits browser spam; add Turnstile if direct HTTP abuse appears.
export function isAllowedAbandonedCheckoutOrigin(
  value: string | null,
): boolean {
  if (!value) return false;

  try {
    const url = new URL(value);
    if (
      url.username || url.password || url.pathname !== "/" || url.search ||
      url.hash
    ) {
      return false;
    }

    const host = url.hostname.toLowerCase();
    if (
      url.protocol === "http:" &&
      (host === "localhost" || host === "127.0.0.1")
    ) return true;

    if (url.protocol !== "https:" || url.port) return false;
    return host === "tripwithnomads.com" ||
      host === "www.tripwithnomads.com" ||
      host === "maroon-aside-814100.framer.app" ||
      FRAMER_PREVIEW_HOST.test(host);
  } catch {
    return false;
  }
}
