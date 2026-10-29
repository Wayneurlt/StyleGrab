import type { H3Event } from 'h3'
import { ZodError, type ZodType, type ZodTypeDef } from 'zod'
import type { Permission } from '../../shared/permissions'
import type { Actor } from '../lib/actor'
import { DomainError } from '../lib/errors'
import { resolveStaffSession } from '../services/auth'

export const STAFF_COOKIE = 'sg_staff'

export function clientIp(event: H3Event): string | null {
  return getRequestIP(event, { xForwardedFor: process.env.TRUST_PROXY === 'true' }) ?? null
}

/** Maps domain/validation/database errors to safe HTTP errors. Unknown errors become a generic 500 and are logged. */
export function toHttpError(e: unknown) {
  if (e instanceof DomainError) {
    return createError({ statusCode: e.status, statusMessage: e.code, message: e.message, data: { code: e.code, ...e.details } })
  }
  if (e instanceof ZodError) {
    const fieldErrors = e.flatten().fieldErrors
    const first = e.issues[0]
    return createError({ statusCode: 422, statusMessage: 'validation_error', message: first ? `${first.path.join('.') || 'input'}: ${first.message}` : 'Invalid input', data: { code: 'validation_error', fieldErrors } })
  }
  const err = e as { statusCode?: number, code?: string }
  if (err?.statusCode) return e as ReturnType<typeof createError>
  if (err?.code === 'P2002') return createError({ statusCode: 409, statusMessage: 'conflict', message: 'This record already exists', data: { code: 'conflict' } })
  if (err?.code === 'P2025') return createError({ statusCode: 404, statusMessage: 'not_found', message: 'Record not found', data: { code: 'not_found' } })
  console.error(JSON.stringify({ level: 'error', msg: 'unhandled_api_error', error: e instanceof Error ? { name: e.name, message: e.message, stack: e.stack } : String(e) }))
  return createError({ statusCode: 500, statusMessage: 'server_error', message: 'Something went wrong. Please try again.', data: { code: 'server_error' } })
}

/** Wrap an API handler so every thrown error is mapped consistently. */
export function defineApi<T>(handler: (event: H3Event) => Promise<T>) {
  return defineEventHandler(async (event) => {
    try {
      return await handler(event)
    }
    catch (e) {
      throw toHttpError(e)
    }
  })
}

export async function body<T>(event: H3Event, schema: ZodType<T, ZodTypeDef, unknown>): Promise<T> {
  return schema.parse(await readBody(event))
}

export function query<T>(event: H3Event, schema: ZodType<T, ZodTypeDef, unknown>): T {
  return schema.parse(getQuery(event))
}

export function param(event: H3Event, name: string): string {
  const v = getRouterParam(event, name)
  if (!v || v.length > 64) throw new DomainError('invalid_id', 'Invalid identifier', 400)
  return v
}

interface StaffContext {
  actor: Actor
  user: { id: string, email: string, name: string, role: { key: string, name: string, permissions: string[] } }
}

/** Resolve the signed-in staff member (cached per request) and optionally enforce a permission. */
export async function requireStaff(event: H3Event, ...permissions: Permission[]): Promise<StaffContext> {
  let ctx = event.context.staff as StaffContext | undefined | null
  if (ctx === undefined) {
    const u = await resolveStaffSession(getCookie(event, STAFF_COOKIE))
    ctx = u
      ? {
          user: { id: u.id, email: u.email, name: u.name, role: { key: u.role.key, name: u.role.name, permissions: u.role.permissions } },
          actor: { userId: u.id, label: u.email, permissions: new Set(u.role.key === 'owner' ? ['*', ...u.role.permissions] : u.role.permissions), ip: clientIp(event) },
        }
      : null
    event.context.staff = ctx
  }
  if (!ctx) throw new DomainError('unauthenticated', 'Please sign in', 401)
  for (const p of permissions) {
    if (!ctx.actor.permissions.has('*') && !ctx.actor.permissions.has(p)) throw new DomainError('forbidden', 'You do not have permission to perform this action', 403)
  }
  return ctx
}

/** Signed-in staff holding at least one of the given permissions. */
export async function requireAny(event: H3Event, permissions: Permission[]): Promise<StaffContext> {
  const ctx = await requireStaff(event)
  if (!permissions.some(p => ctx.actor.permissions.has('*') || ctx.actor.permissions.has(p))) {
    throw new DomainError('forbidden', 'You do not have permission to perform this action', 403)
  }
  return ctx
}

export function setSessionCookie(event: H3Event, name: string, token: string, expires: Date) {
  setCookie(event, name, token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', expires })
}

// ---------------------------------------------------------------------------
// In-memory fixed-window rate limiter (per process). Use a shared store if running multiple instances.
// ---------------------------------------------------------------------------
const buckets = new Map<string, { count: number, resetAt: number }>()

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now()
  const b = buckets.get(key)
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    if (buckets.size > 10_000) for (const [k, v] of buckets) if (v.resetAt < now) buckets.delete(k)
    return
  }
  b.count++
  if (b.count > limit) throw new DomainError('rate_limited', `Too many attempts. Try again in ${Math.ceil((b.resetAt - now) / 60_000)} minute(s).`, 429)
}

export function pagination(q: { page?: number, pageSize?: number }) {
  return { page: Math.max(1, q.page ?? 1), pageSize: Math.min(100, Math.max(1, q.pageSize ?? 25)) }
}
