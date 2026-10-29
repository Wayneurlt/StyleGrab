import type { Permission } from '../../shared/permissions'
import { forbidden } from './errors'

/** Who is performing an operation. Every service that mutates state receives one. */
export interface Actor {
  userId: string | null
  label: string
  permissions: ReadonlySet<string>
  ip?: string | null
}

export const systemActor: Actor = { userId: null, label: 'system', permissions: new Set(['*']) }

export function can(actor: Actor, permission: Permission): boolean {
  return actor.permissions.has('*') || actor.permissions.has(permission)
}

export function assertCan(actor: Actor, permission: Permission, message?: string): void {
  if (!can(actor, permission)) throw forbidden(message)
}
