import { createHash, randomBytes } from 'node:crypto'
import { hash, verify } from '@node-rs/argon2'
import type { Actor } from '../lib/actor'
import { assertCan } from '../lib/actor'
import { audit } from '../lib/audit'
import { conflict, DomainError, forbidden, invalid, isUniqueViolation, notFound } from '../lib/errors'
import { prisma, withTx } from '../lib/prisma'
import { normalizeEmail } from './customers'

export const STAFF_SESSION_HOURS = 12

export const hashPassword = (password: string) => hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 })
export const verifyPassword = (hashed: string, password: string) => verify(hashed, password).catch(() => false)

export function validatePasswordStrength(password: string) {
  if (password.length < 10) throw invalid('weak_password', 'Passwords must be at least 10 characters')
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) throw invalid('weak_password', 'Passwords must contain letters and numbers')
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

// A fixed dummy hash so failed lookups take as long as real verifications (no user enumeration by timing).
let dummyHash: string | null = null
async function burnTime(password: string) {
  dummyHash ??= await hashPassword('dummy-password-0')
  await verifyPassword(dummyHash, password)
}

async function createSession(userId: string, meta: { ip?: string | null, userAgent?: string | null }) {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + STAFF_SESSION_HOURS * 3_600_000)
  await prisma.session.create({
    data: { tokenHash: sha256(token), expiresAt, ip: meta.ip ?? null, userAgent: meta.userAgent?.slice(0, 250) ?? null, userId },
  })
  return { token, expiresAt }
}

export async function loginStaff(email: string, password: string, meta: { ip?: string | null, userAgent?: string | null }) {
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } })
  if (!user) {
    await burnTime(password)
    throw new DomainError('invalid_credentials', 'Incorrect email or password', 401)
  }
  if (!(await verifyPassword(user.passwordHash, password))) {
    await prisma.auditEvent.create({ data: { actorId: user.id, actorLabel: user.email, action: 'auth.login_failed', entityType: 'user', entityId: user.id, ip: meta.ip ?? null } })
    throw new DomainError('invalid_credentials', 'Incorrect email or password', 401)
  }
  if (!user.isActive) throw new DomainError('account_disabled', 'This account has been deactivated', 403)
  const session = await createSession(user.id, meta)
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
  await prisma.auditEvent.create({ data: { actorId: user.id, actorLabel: user.email, action: 'auth.login', entityType: 'user', entityId: user.id, ip: meta.ip ?? null } })
  return session
}

async function findSession(token: string | undefined) {
  if (!token) return null
  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { include: { role: true } }, customer: true },
  })
  return session && session.expiresAt > new Date() ? session : null
}

export async function resolveStaffSession(token: string | undefined) {
  const session = await findSession(token)
  return session?.user?.isActive ? session.user : null
}


export async function destroySession(token: string | undefined) {
  if (!token) return
  await prisma.session.deleteMany({ where: { tokenHash: sha256(token) } })
}

export async function changeOwnPassword(userId: string, current: string, next: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user || !(await verifyPassword(user.passwordHash, current))) throw invalid('invalid_password', 'Your current password is incorrect')
  validatePasswordStrength(next)
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(next) } }),
    prisma.session.deleteMany({ where: { userId } }),
    prisma.auditEvent.create({ data: { actorId: userId, actorLabel: user.email, action: 'auth.password_change', entityType: 'user', entityId: userId } }),
  ])
}

// ---------------------------------------------------------------------------
// Staff management
// ---------------------------------------------------------------------------

export async function createUser(actor: Actor, input: { email: string, name: string, roleId: string, password: string }) {
  assertCan(actor, 'users.manage')
  validatePasswordStrength(input.password)
  const email = normalizeEmail(input.email)!
  const passwordHash = await hashPassword(input.password)
  try {
    return await withTx(async (tx) => {
      const role = await tx.role.findUnique({ where: { id: input.roleId } })
      if (!role) throw notFound('Role')
      const user = await tx.user.create({ data: { email, name: input.name.trim(), roleId: role.id, passwordHash } })
      await audit(tx, actor, { action: 'user.create', entityType: 'user', entityId: user.id, after: { email, name: input.name, role: role.key } })
      return user
    })
  }
  catch (e) {
    if (isUniqueViolation(e, 'email')) throw conflict('duplicate_email', 'A staff account with this email already exists')
    throw e
  }
}

export async function updateUser(actor: Actor, id: string, input: { name?: string, roleId?: string, isActive?: boolean, password?: string }) {
  assertCan(actor, 'users.manage')
  if (id === actor.userId && (input.isActive === false || input.roleId)) throw forbidden('You cannot deactivate yourself or change your own role')
  if (input.password) validatePasswordStrength(input.password)
  const passwordHash = input.password ? await hashPassword(input.password) : undefined
  return withTx(async (tx) => {
    const before = await tx.user.findUnique({ where: { id }, include: { role: true } })
    if (!before) throw notFound('User')
    if (input.roleId && !(await tx.role.findUnique({ where: { id: input.roleId } }))) throw notFound('Role')
    // Never leave the system without an active owner.
    if (before.role.key === 'owner' && (input.isActive === false || (input.roleId && input.roleId !== before.roleId))) {
      const owners = await tx.user.count({ where: { role: { key: 'owner' }, isActive: true } })
      if (owners <= 1) throw conflict('last_owner', 'At least one active owner account is required')
    }
    const user = await tx.user.update({ where: { id }, data: { name: input.name?.trim(), roleId: input.roleId, isActive: input.isActive, passwordHash } })
    if (input.isActive === false || passwordHash) await tx.session.deleteMany({ where: { userId: id } })
    await audit(tx, actor, {
      action: input.isActive === false ? 'user.deactivate' : input.isActive === true && !before.isActive ? 'user.activate' : input.roleId ? 'user.role_change' : 'user.update',
      entityType: 'user',
      entityId: id,
      before: { name: before.name, roleId: before.roleId, isActive: before.isActive },
      after: { name: input.name, roleId: input.roleId, isActive: input.isActive, passwordReset: !!passwordHash },
    })
    return user
  })
}

export async function updateRolePermissions(actor: Actor, roleId: string, permissions: string[]) {
  assertCan(actor, 'users.manage')
  return withTx(async (tx) => {
    const role = await tx.role.findUnique({ where: { id: roleId } })
    if (!role) throw notFound('Role')
    if (role.key === 'owner') throw forbidden('The owner role always has full access')
    await tx.role.update({ where: { id: roleId }, data: { permissions } })
    await audit(tx, actor, { action: 'role.permissions', entityType: 'role', entityId: roleId, before: { permissions: role.permissions }, after: { permissions } })
  })
}
