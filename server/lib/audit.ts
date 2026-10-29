import type { Prisma } from '@prisma/client'
import type { Actor } from './actor'
import type { Tx } from './prisma'

const SECRET_KEYS = /password|token|secret|hash/i

function scrub(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined
  return JSON.parse(JSON.stringify(value, (k, v) => (SECRET_KEYS.test(k) ? '[redacted]' : v))) as Prisma.InputJsonValue
}

export interface AuditInput {
  action: string
  entityType: string
  entityId?: string | null
  before?: unknown
  after?: unknown
  reason?: string | null
}

/** Append an audit event inside the caller's transaction, so it commits or rolls back with the change. */
export async function audit(tx: Tx, actor: Actor, input: AuditInput): Promise<void> {
  await tx.auditEvent.create({
    data: {
      actorId: actor.userId,
      actorLabel: actor.label,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      before: scrub(input.before),
      after: scrub(input.after),
      reason: input.reason ?? null,
      ip: actor.ip ?? null,
    },
  })
}

/** Shallow diff of the keys that changed, for compact before/after audit payloads. */
export function diff<T extends Record<string, unknown>>(before: T, after: Partial<T>): { before: Partial<T>, after: Partial<T> } | null {
  const b: Partial<T> = {}
  const a: Partial<T> = {}
  for (const key of Object.keys(after) as (keyof T)[]) {
    if (after[key] === undefined) continue
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      b[key] = before[key]
      a[key] = after[key]
    }
  }
  return Object.keys(a).length ? { before: b, after: a } : null
}
