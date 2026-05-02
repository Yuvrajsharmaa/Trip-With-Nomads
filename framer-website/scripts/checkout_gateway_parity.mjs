#!/usr/bin/env node

const SUPABASE_URL = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "")
const SUPABASE_ANON_KEY = String(process.env.SUPABASE_ANON_KEY || "").trim()
const CHECKOUT_GATEWAY_BASE = String(process.env.CHECKOUT_GATEWAY_BASE || "").trim().replace(/\/+$/, "")
const TRIP_SLUG = String(process.env.TRIP_SLUG || "").trim()
const TRIP_ID = String(process.env.TRIP_ID || "").trim()

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !CHECKOUT_GATEWAY_BASE) {
  console.error("Missing required envs: SUPABASE_URL, SUPABASE_ANON_KEY, CHECKOUT_GATEWAY_BASE")
  process.exit(1)
}

if (!TRIP_SLUG && !TRIP_ID) {
  console.error("Provide TRIP_SLUG or TRIP_ID")
  process.exit(1)
}

function toJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function pickShape(value) {
  if (Array.isArray(value)) return `array(${value.length})`
  if (!value || typeof value !== "object") return typeof value
  return Object.keys(value).sort()
}

async function call(label, url, options = {}) {
  const res = await fetch(url, options)
  const raw = await res.text()
  const json = toJson(raw)
  return {
    label,
    status: res.status,
    ok: res.ok,
    shape: pickShape(json),
    body: json ?? raw.slice(0, 400),
  }
}

async function main() {
  const query = new URLSearchParams()
  if (TRIP_SLUG) query.set("slug", TRIP_SLUG)
  if (TRIP_ID) query.set("trip_id", TRIP_ID)
  query.set("v", "3")

  const directDisplay = await call(
    "direct:display-price",
    `${SUPABASE_URL}/functions/v1/get-trip-display-price?${query.toString()}`,
    {
      method: "GET",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    }
  )

  const gatewayDisplay = await call(
    "gateway:display-price",
    `${CHECKOUT_GATEWAY_BASE}/display-price?${query.toString()}`,
    { method: "GET" }
  )

  const gatewayContext = await call(
    "gateway:context",
    `${CHECKOUT_GATEWAY_BASE}/context?${query.toString()}`,
    { method: "GET" }
  )

  console.log(JSON.stringify({ directDisplay, gatewayDisplay, gatewayContext }, null, 2))

  if (!gatewayDisplay.ok || !gatewayContext.ok) {
    process.exit(2)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
