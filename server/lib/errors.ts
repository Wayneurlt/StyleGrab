/** Business-rule failure. Mapped to an HTTP error by the API layer; safe to show to users. */
export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'DomainError'
  }
}

export const notFound = (what: string) => new DomainError('not_found', `${what} not found`, 404)
export const forbidden = (message = 'You do not have permission to perform this action') => new DomainError('forbidden', message, 403)
export const conflict = (code: string, message: string, details?: Record<string, unknown>) => new DomainError(code, message, 409, details)
export const invalid = (code: string, message: string, details?: Record<string, unknown>) => new DomainError(code, message, 422, details)

export function isUniqueViolation(e: unknown, field?: string): boolean {
  const err = e as { code?: string, meta?: { target?: string[] | string } }
  if (err?.code !== 'P2002') return false
  if (!field) return true
  const target = err.meta?.target
  return Array.isArray(target) ? target.includes(field) : String(target ?? '').includes(field)
}
