import { Hono } from 'hono'
import { cors } from 'hono/cors'

type Bindings = {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
  ENVIRONMENT: string
}

const app = new Hono<{ Bindings: Bindings }>()

const FUNCTION_ALIAS: Record<string, string> = {
  context: 'get-trip-checkout-context',
  'display-price': 'get-trip-display-price',
}

function normalizeFunctionSlug(rawPath: string): string {
  const clean = String(rawPath || '').trim().replace(/^\/+|\/+$/g, '')
  if (!clean) return ''
  return FUNCTION_ALIAS[clean] || clean
}

function toUpstreamFunctionUrl(baseUrl: string, path: string, requestUrl: string): string {
  const upstreamPath = normalizeFunctionSlug(path)
  const search = new URL(requestUrl).search || ''
  return `${baseUrl}/functions/v1/${upstreamPath}${search}`
}

/** Extract a trip slug from a URL (e.g. /upcoming-trips/vietnam-twn). */
function extractSlugFromUrl(urlStr: string | null): string {
  if (!urlStr) return ''
  try {
    const url = new URL(urlStr)
    const match = url.pathname.match(/\/upcoming-trips\/([^/?#]+)/i)
    if (match?.[1]) return decodeURIComponent(match[1])
  } catch { /* ignore invalid URLs */ }
  return ''
}

/** Attempt a slug-based fallback when trip_id lookup fails. */
async function trySlugFallback(c: any, rawPath: string, originalUrl: string): Promise<Response | null> {
  const upstreamPath = normalizeFunctionSlug(rawPath)
  if (!upstreamPath) return null
  const functionName = FUNCTION_ALIAS[rawPath] || rawPath
  // Only apply fallback for the checkout context endpoint
  if (functionName !== 'get-trip-checkout-context') return null

  // Check original request had a trip_id
  const reqUrl = new URL(originalUrl)
  if (!reqUrl.searchParams.has('trip_id')) return null

  // Try to get slug from page_url query param (set by Framer override),
  // then fall back to Referer header (origin-only for cross-origin requests).
  const pageUrl = reqUrl.searchParams.get('page_url') || ''
  const referer = c.req.header('Referer') || ''
  const slug = extractSlugFromUrl(pageUrl) || extractSlugFromUrl(referer)
  if (!slug) return null

  // Build fallback URL — replace trip_id with slug
  const fallbackParams = new URLSearchParams(reqUrl.searchParams)
  fallbackParams.delete('trip_id')
  fallbackParams.set('slug', slug)

  const url = `${c.env.SUPABASE_URL}/functions/v1/${upstreamPath}?${fallbackParams.toString()}`
  const headers = new Headers()
  headers.set('Authorization', `Bearer ${c.env.SUPABASE_SERVICE_ROLE_KEY}`)
  headers.set('apikey', c.env.SUPABASE_SERVICE_ROLE_KEY)

  try {
    const response = await fetch(url, { method: 'GET', headers })
    if (!response.ok) return null
    const responseHeaders = new Headers(response.headers)
    responseHeaders.delete('access-control-allow-origin')
    responseHeaders.delete('access-control-allow-methods')
    responseHeaders.delete('access-control-allow-headers')
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    })
  } catch {
    return null
  }
}

// CORS configuration - Allow Framer sites and production domains
app.use('*', cors({
  origin: (origin) => {
    if (!origin) return null
    try {
      const url = new URL(origin)
      if (
        url.hostname === 'tripwithnomads.com' ||
        url.hostname.endsWith('.tripwithnomads.com') ||
        url.hostname.endsWith('.framer.app') ||
        url.hostname.endsWith('.framer.website') ||
        url.hostname === 'framercanvas.com' ||
        url.hostname.endsWith('.framercanvas.com') ||
        url.hostname.includes('framer.com') ||
        url.hostname === 'localhost'
      ) {
        return origin
      }
    } catch {
      return null
    }
    return null
  },
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'apikey'],
  maxAge: 86400,
}))

async function proxyEdgeFunction(c: any, rawPath: string) {
  const slug = normalizeFunctionSlug(rawPath)
  if (!slug) {
    return c.json({ error: 'Route not found' }, 404)
  }

  const url = toUpstreamFunctionUrl(c.env.SUPABASE_URL, slug, c.req.url)
  const method = c.req.method
  const headers = new Headers(c.req.raw.headers)

  // Inject Service Role Key for elevated permissions
  headers.set('Authorization', `Bearer ${c.env.SUPABASE_SERVICE_ROLE_KEY}`)
  headers.set('apikey', c.env.SUPABASE_SERVICE_ROLE_KEY)

  // Clean up headers that might cause issues with Supabase
  headers.delete('host')
  headers.delete('cf-connecting-ip')
  headers.delete('cf-ray')
  headers.delete('cf-visitor')

  const body = method !== 'GET' && method !== 'HEAD' ? await c.req.arrayBuffer() : undefined

  try {
    const response = await fetch(url, {
      method,
      headers,
      body,
    })

    // When the upstream returns 404 for a trip_id lookup, try slug fallback
    // using the Referer header (which contains the Framer page URL).
    if (response.status === 404) {
      const fallbackResponse = await trySlugFallback(c, rawPath, c.req.url)
      if (fallbackResponse) return fallbackResponse
    }

    const responseHeaders = new Headers(response.headers)
    // Ensure CORS headers from our worker take precedence
    responseHeaders.delete('access-control-allow-origin')
    responseHeaders.delete('access-control-allow-methods')
    responseHeaders.delete('access-control-allow-headers')

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    })
  } catch (error: any) {
    return c.json({ error: 'Gateway Proxy Error', details: error.message }, 500)
  }
}

// Canonical function route
app.all('/:path', async (c) => proxyEdgeFunction(c, c.req.param('path')))

// Legacy compatibility routes
app.all('/functions/v1/:path', async (c) => proxyEdgeFunction(c, c.req.param('path')))
app.all('/api/checkout/:path', async (c) => proxyEdgeFunction(c, c.req.param('path')))

// Specialized route for direct REST API (used by fetchTripIdBySlug etc)
app.all('/rest/v1/:table', async (c) => {
  if (c.req.method !== 'GET') {
    return c.json({ error: 'Method not allowed for REST proxy' }, 405)
  }

  const table = c.req.param('table')
  const allowedTables = ['trips', 'trip_pricing']
  if (!allowedTables.includes(table)) {
    return c.json({ error: 'Forbidden table access' }, 403)
  }

  const query = c.req.url.split('?')[1] || ''
  const url = `${c.env.SUPABASE_URL}/rest/v1/${table}${query ? '?' + query : ''}`
  
  const headers = new Headers(c.req.raw.headers)
  headers.set('Authorization', `Bearer ${c.env.SUPABASE_SERVICE_ROLE_KEY}`)
  headers.set('apikey', c.env.SUPABASE_SERVICE_ROLE_KEY)
  headers.delete('host')

  const body = c.req.method !== 'GET' ? await c.req.arrayBuffer() : undefined

  try {
    const response = await fetch(url, {
      method: c.req.method,
      headers,
      body,
    })
    return new Response(response.body, {
      status: response.status,
      headers: response.headers
    })
  } catch (error: any) {
    return c.json({ error: 'REST Proxy Error', details: error.message }, 500)
  }
})

export default app
