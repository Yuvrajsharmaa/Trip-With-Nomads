function normalizeSlug(value: unknown): string {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";

  const fromUrl = raw.match(/\/upcoming-trips\/([^/?#]+)/i);
  let candidate = raw;
  if (fromUrl?.[1]) {
    try {
      candidate = decodeURIComponent(fromUrl[1]).toLowerCase();
    } catch (_) {
      return "";
    }
  }
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(candidate) ? candidate : "";
}

export function readTripSlugFallback(text: unknown, children: unknown): string {
  const textSlug = normalizeSlug(text);
  if (textSlug) return textSlug;
  return typeof children === "string" ? normalizeSlug(children) : "";
}
