interface Env {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
  CHECKOUT_ALLOWED_ORIGINS?: string
  CHECKOUT_MAX_BODY_BYTES?: string
  CHECKOUT_RATE_LIMIT_WINDOW_SEC?: string
  CHECKOUT_RATE_LIMIT_WRITE_LIMIT?: string
}

type RouteKey =
  | "context"
  | "display-price"
  | "validate-coupon"
  | "create-booking"
  | "booking-status"
  | "retry-payment"

type RouteConfig = {
  method: "GET" | "POST"
  rateLimited: boolean
  handler: (request: Request, env: Env, ctx: ExecutionContext) => Promise<Response>
}

type RateBucket = {
  count: number
  resetAt: number
}

const DEFAULT_ALLOWED_ORIGINS = [
  "https://tripwithnomads.com",
  "https://www.tripwithnomads.com",
  "https://maroon-aside-814100.framer.app",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]

const rateBuckets = new Map<string, RateBucket>()

function getAllowedOrigins(env: Env): string[] {
  const fromEnv = String(env.CHECKOUT_ALLOWED_ORIGINS || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
  const merged = fromEnv.length ? fromEnv : DEFAULT_ALLOWED_ORIGINS
  return [...new Set(merged)]
}

function pickOrigin(request: Request, env: Env): string {
  const origin = String(request.headers.get("Origin") || "").trim()
  const allowed = getAllowedOrigins(env)
  if (origin && allowed.includes(origin)) return origin
  return allowed[0] || "https://tripwithnomads.com"
}

function corsHeaders(request: Request, env: Env): HeadersInit {
  return {
    "Access-Control-Allow-Origin": pickOrigin(request, env),
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Requested-With",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  }
}

function jsonResponse(request: Request, env: Env, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request, env),
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  })
}

function notFound(request: Request, env: Env): Response {
  return jsonResponse(request, env, 404, { error: "Route not found" })
}

function methodNotAllowed(request: Request, env: Env): Response {
  return jsonResponse(request, env, 405, { error: "Method not allowed" })
}

function tooLarge(request: Request, env: Env): Response {
  return jsonResponse(request, env, 413, { error: "Payload too large" })
}

function parsePath(pathname: string): RouteKey | null {
  const match = pathname.match(/\/api\/checkout\/([a-z-]+)\/?$/i)
  if (!match) return null
  const key = String(match[1] || "").trim().toLowerCase()
  if (
    key === "context" ||
    key === "display-price" ||
    key === "validate-coupon" ||
    key === "create-booking" ||
    key === "booking-status" ||
    key === "retry-payment"
  ) {
    return key
  }
  return null
}

function getClientIp(request: Request): string {
  const fromCf = String(request.headers.get("CF-Connecting-IP") || "").trim()
  if (fromCf) return fromCf
  const fromForwarded = String(request.headers.get("X-Forwarded-For") || "")
    .split(",")
    .map((entry) => entry.trim())
    .find(Boolean)
  return fromForwarded || "unknown"
}

function isAllowedOrigin(request: Request, env: Env): boolean {
  const origin = String(request.headers.get("Origin") || "").trim()
  if (!origin) return true
  return getAllowedOrigins(env).includes(origin)
}

function getWindowMs(env: Env): number {
  const value = Number.parseInt(String(env.CHECKOUT_RATE_LIMIT_WINDOW_SEC || "60"), 10)
  const seconds = Number.isFinite(value) && value > 0 ? value : 60
  return seconds * 1000
}

function getWriteLimit(env: Env): number {
  const value = Number.parseInt(String(env.CHECKOUT_RATE_LIMIT_WRITE_LIMIT || "40"), 10)
  return Number.isFinite(value) && value > 0 ? value : 40
}

function rateLimitHit(request: Request, env: Env, route: RouteKey): boolean {
  const key = `${route}:${getClientIp(request)}`
  const now = Date.now()
  const windowMs = getWindowMs(env)
  const maxWrites = getWriteLimit(env)
  const bucket = rateBuckets.get(key)

  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs })
    return false
  }

  if (bucket.count >= maxWrites) {
    return true
  }

  bucket.count += 1
  rateBuckets.set(key, bucket)
  return false
}

function getMaxBodyBytes(env: Env): number {
  const value = Number.parseInt(String(env.CHECKOUT_MAX_BODY_BYTES || "65536"), 10)
  return Number.isFinite(value) && value > 0 ? value : 65536
}

function buildSupabaseHeaders(env: Env, contentType?: string | null): HeadersInit {
  const headers: Record<string, string> = {
    apikey: String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim(),
    Authorization: `Bearer ${String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim()}`,
    Accept: "application/json",
  }
  const cleanContentType = String(contentType || "").trim()
  if (cleanContentType) headers["Content-Type"] = cleanContentType
  return headers
}

async function proxyFunction(
  request: Request,
  env: Env,
  fnName: string,
  method: "GET" | "POST"
): Promise<Response> {
  const supabaseUrl = String(env.SUPABASE_URL || "").trim().replace(/\/+$/, "")
  const upstreamUrl = new URL(`${supabaseUrl}/functions/v1/${fnName}`)

  if (method === "GET") {
    const incoming = new URL(request.url)
    incoming.searchParams.forEach((value, key) => upstreamUrl.searchParams.append(key, value))
    const upstream = await fetch(upstreamUrl.toString(), {
      method: "GET",
      headers: buildSupabaseHeaders(env),
    })
    return relayResponse(request, env, upstream)
  }

  const bodyBuffer = await request.arrayBuffer()
  if (bodyBuffer.byteLength > getMaxBodyBytes(env)) return tooLarge(request, env)

  const upstream = await fetch(upstreamUrl.toString(), {
    method: "POST",
    headers: buildSupabaseHeaders(env, request.headers.get("Content-Type")),
    body: bodyBuffer,
  })
  return relayResponse(request, env, upstream)
}

async function relayResponse(request: Request, env: Env, upstream: Response): Promise<Response> {
  const responseHeaders = new Headers(corsHeaders(request, env))
  responseHeaders.set("Cache-Control", "no-store")

  const upstreamType = String(upstream.headers.get("Content-Type") || "").trim()
  if (upstreamType) responseHeaders.set("Content-Type", upstreamType)

  const body = await upstream.arrayBuffer()
  return new Response(body, {
    status: upstream.status,
    headers: responseHeaders,
  })
}

async function fetchJsonFromSupabase(
  env: Env,
  path: string,
  query: Record<string, string>
): Promise<any[] | null> {
  const supabaseUrl = String(env.SUPABASE_URL || "").trim().replace(/\/+$/, "")
  const url = new URL(`${supabaseUrl}/rest/v1/${path}`)
  Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value))

  const res = await fetch(url.toString(), {
    headers: buildSupabaseHeaders(env),
  })
  if (!res.ok) return null

  const payload = await res.json().catch(() => null)
  return Array.isArray(payload) ? payload : null
}

function getVariantValue(row: any): string {
  const candidates = [
    row?.sharing,
    row?.variant,
    row?.variant_name,
    row?.type,
    row?.room_type,
    row?.occupancy,
    row?.sharing_type,
  ]

  for (const value of candidates) {
    const clean = String(value || "").trim()
    if (clean) return clean
  }
  return ""
}

function isInviteOnly(pricingRows: any[]): boolean {
  if (!Array.isArray(pricingRows) || pricingRows.length === 0) return false
  return !pricingRows.some((row) => Boolean(getVariantValue(row)))
}

async function handleContext(request: Request, env: Env): Promise<Response> {
  const incoming = new URL(request.url)
  const tripId = String(incoming.searchParams.get("trip_id") || incoming.searchParams.get("tripId") || "").trim()
  const slug = String(incoming.searchParams.get("slug") || "").trim()

  if (!tripId && !slug) {
    return jsonResponse(request, env, 400, { error: "trip_id or slug is required" })
  }

  let tripRows: any[] | null = null
  if (tripId) {
    tripRows = await fetchJsonFromSupabase(env, "trips", {
      id: `eq.${tripId}`,
      select: "id,slug,title",
      limit: "1",
    })
  } else {
    tripRows = await fetchJsonFromSupabase(env, "trips", {
      slug: `eq.${slug}`,
      select: "id,slug,title",
      limit: "1",
    })
  }

  if (!tripRows || !tripRows[0]?.id) {
    return jsonResponse(request, env, 404, { error: "Trip not found" })
  }

  const trip = {
    id: String(tripRows[0].id || ""),
    slug: String(tripRows[0].slug || ""),
    title: String(tripRows[0].title || ""),
  }

  const pricingRows =
    (await fetchJsonFromSupabase(env, "trip_pricing", {
      trip_id: `eq.${trip.id}`,
      select: "*",
      order: "start_date.asc.nullslast",
    })) || []

  const payload = {
    trip,
    pricing: pricingRows,
    invite_only: isInviteOnly(pricingRows),
    engine_version: "checkout-gateway-v1",
  }

  return jsonResponse(request, env, 200, payload)
}

const routeConfig: Record<RouteKey, RouteConfig> = {
  context: {
    method: "GET",
    rateLimited: false,
    handler: (request, env) => handleContext(request, env),
  },
  "display-price": {
    method: "GET",
    rateLimited: false,
    handler: (request, env) => proxyFunction(request, env, "get-trip-display-price", "GET"),
  },
  "validate-coupon": {
    method: "POST",
    rateLimited: true,
    handler: (request, env) => proxyFunction(request, env, "validate-coupon", "POST"),
  },
  "create-booking": {
    method: "POST",
    rateLimited: true,
    handler: (request, env) => proxyFunction(request, env, "create-booking", "POST"),
  },
  "booking-status": {
    method: "POST",
    rateLimited: true,
    handler: (request, env) => proxyFunction(request, env, "get-booking-status", "POST"),
  },
  "retry-payment": {
    method: "POST",
    rateLimited: true,
    handler: (request, env) => proxyFunction(request, env, "retry-payment", "POST"),
  },
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      return jsonResponse(request, env, 500, {
        error: "Gateway not configured",
        missing: [
          !env.SUPABASE_URL ? "SUPABASE_URL" : null,
          !env.SUPABASE_SERVICE_ROLE_KEY ? "SUPABASE_SERVICE_ROLE_KEY" : null,
        ].filter(Boolean),
      })
    }

    if (request.method === "OPTIONS") {
      return new Response("ok", {
        headers: corsHeaders(request, env),
      })
    }

    if (!isAllowedOrigin(request, env)) {
      return jsonResponse(request, env, 403, { error: "Origin not allowed" })
    }

    const url = new URL(request.url)
    const route = parsePath(url.pathname)
    if (!route) return notFound(request, env)

    const config = routeConfig[route]
    if (!config) return notFound(request, env)

    if (request.method !== config.method) {
      return methodNotAllowed(request, env)
    }

    if (config.rateLimited && rateLimitHit(request, env, route)) {
      return jsonResponse(request, env, 429, { error: "Rate limit exceeded" })
    }

    try {
      return await config.handler(request, env, ctx)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gateway request failed"
      return jsonResponse(request, env, 502, {
        error: "Upstream request failed",
        message,
      })
    }
  },
}
