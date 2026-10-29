/**
 * - CSRF: state-changing API requests must come from this origin (Origin/Referer check). Session cookies are
 *   also SameSite=Lax. Requests without either header (non-browser clients) are rejected for cookie-authenticated routes.
 * - Security headers for every response.
 * - Structured request log for API calls.
 */
export default defineEventHandler((event) => {
  setResponseHeaders(event, {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  })

  const path = event.path
  if (!path.startsWith('/api/')) return
  const method = event.method
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return

  const host = getRequestHost(event, { xForwardedHost: process.env.TRUST_PROXY === 'true' })
  const source = getRequestHeader(event, 'origin') ?? getRequestHeader(event, 'referer')
  let sourceHost: string | null
  try {
    sourceHost = source ? new URL(source).host : null
  }
  catch {
    sourceHost = null
  }
  if (!sourceHost || sourceHost !== host) {
    throw createError({ statusCode: 403, statusMessage: 'csrf', message: 'Cross-site request blocked', data: { code: 'csrf' } })
  }

  const started = Date.now()
  event.node.res.once('finish', () => {
    console.log(JSON.stringify({ level: 'info', msg: 'api', method, path: path.split('?')[0], status: event.node.res.statusCode, ms: Date.now() - started }))
  })
})
