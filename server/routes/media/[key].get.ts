import { getObject } from '~~/server/utils/storage'

/** Serves uploaded images. Keys are random, immutable names, so responses can be cached aggressively. */
export default defineEventHandler(async (event) => {
  const key = getRouterParam(event, 'key') ?? ''
  const obj = await getObject(key)
  if (!obj) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  setResponseHeaders(event, {
    'Content-Type': obj.mimeType,
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'",
  })
  return obj.data
})
