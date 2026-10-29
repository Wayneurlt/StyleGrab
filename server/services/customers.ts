import type { Prisma } from '@prisma/client'
import type { Actor } from '../lib/actor'
import { assertCan, can } from '../lib/actor'
import { audit, diff } from '../lib/audit'
import { conflict, invalid, isUniqueViolation, notFound } from '../lib/errors'
import { prisma, withTx, type Tx } from '../lib/prisma'
import { outstandingBalance } from './payments'

/** Normalise Kenyan-style phone numbers to digits with country code (0712… → 254712…). */
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null
  let digits = phone.replace(/\D/g, '')
  if (!digits) return null
  if (digits.startsWith('0') && digits.length === 10) digits = `254${digits.slice(1)}`
  if (digits.length === 9 && /^[17]/.test(digits)) digits = `254${digits}`
  if (digits.length < 7 || digits.length > 15) throw invalid('invalid_phone', 'Enter a valid phone number')
  return digits
}

export function normalizeEmail(email: string | null | undefined): string | null {
  const e = email?.trim().toLowerCase()
  if (!e) return null
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw invalid('invalid_email', 'Enter a valid email address')
  return e
}

/** Matches an existing customer by phone, then email, before creating one — avoids duplicate records. */
export async function findOrCreateCustomerTx(tx: Tx, input: { name: string, phone?: string | null, email?: string | null }) {
  const phone = normalizePhone(input.phone)
  const email = normalizeEmail(input.email)
  if (!phone && !email) throw invalid('contact_required', 'A phone number or email is required')
  const existing = await tx.customer.findFirst({ where: { OR: [...(phone ? [{ phone }] : []), ...(email ? [{ email }] : [])] } })
  if (existing) {
    // Fill in missing contact details without overwriting what staff recorded.
    const patch: Prisma.CustomerUpdateInput = {}
    if (!existing.phone && phone && !(await tx.customer.findUnique({ where: { phone } }))) patch.phone = phone
    if (!existing.email && email && !(await tx.customer.findUnique({ where: { email } }))) patch.email = email
    return Object.keys(patch).length ? tx.customer.update({ where: { id: existing.id }, data: patch }) : existing
  }
  return tx.customer.create({ data: { name: input.name.trim() || 'Customer', phone, email } })
}

export interface CustomerInput {
  name: string
  phone?: string | null
  email?: string | null
  notes?: string | null
  isActive?: boolean
}

export async function createCustomer(actor: Actor, input: CustomerInput) {
  assertCan(actor, 'customers.manage')
  if (!input.name.trim()) throw invalid('name_required', 'Name is required')
  const phone = normalizePhone(input.phone)
  const email = normalizeEmail(input.email)
  if (input.notes && !can(actor, 'customers.notes')) throw invalid('forbidden_notes', 'You cannot edit private customer notes')
  return withTx(async (tx) => {
    const dup = await tx.customer.findFirst({ where: { OR: [...(phone ? [{ phone }] : []), ...(email ? [{ email }] : [])] } })
    if (dup) throw conflict('duplicate_customer', `A customer with this ${dup.phone === phone ? 'phone number' : 'email'} already exists: ${dup.name}`, { customerId: dup.id })
    const c = await tx.customer.create({ data: { name: input.name.trim(), phone, email, notes: input.notes ?? null } })
    await audit(tx, actor, { action: 'customer.create', entityType: 'customer', entityId: c.id, after: { name: c.name } })
    return c
  })
}

export async function updateCustomer(actor: Actor, id: string, input: Partial<CustomerInput>) {
  assertCan(actor, 'customers.manage')
  if (input.notes !== undefined && !can(actor, 'customers.notes')) throw invalid('forbidden_notes', 'You cannot edit private customer notes')
  return withTx(async (tx) => {
    const before = await tx.customer.findUnique({ where: { id } })
    if (!before) throw notFound('Customer')
    const data = {
      name: input.name?.trim(),
      phone: input.phone === undefined ? undefined : normalizePhone(input.phone),
      email: input.email === undefined ? undefined : normalizeEmail(input.email),
      notes: input.notes,
      isActive: input.isActive,
    }
    try {
      const c = await tx.customer.update({ where: { id }, data })
      const d = diff(before as unknown as Record<string, unknown>, data)
      if (d) await audit(tx, actor, { action: input.isActive === false ? 'customer.deactivate' : 'customer.update', entityType: 'customer', entityId: id, ...d })
      return c
    }
    catch (e) {
      if (isUniqueViolation(e)) throw conflict('duplicate_customer', 'Another customer already uses this phone number or email')
      throw e
    }
  })
}

export async function listCustomers(params: { q?: string, status?: 'active' | 'inactive', withBalance?: boolean, page: number, pageSize: number }) {
  const where: Prisma.CustomerWhereInput = {}
  if (params.q) {
    const q = params.q.trim()
    const digits = q.replace(/\D/g, '')
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { email: { contains: q.toLowerCase() } },
      ...(digits.length >= 3 ? [{ phone: { contains: digits.replace(/^0/, '') } }] : []),
    ]
  }
  if (params.status) where.isActive = params.status === 'active'
  if (params.withBalance) {
    const ids = await prisma.$queryRaw<{ customerId: string }[]>`
      SELECT "customerId" FROM "Order" WHERE "customerId" IS NOT NULL AND "status" <> 'CANCELLED'
      GROUP BY "customerId" HAVING SUM("total" - "amountReturned" - ("amountPaid" - "amountRefunded")) > 0`
    where.id = { in: ids.map(r => r.customerId) }
  }
  const [total, rows] = await Promise.all([
    prisma.customer.count({ where }),
    prisma.customer.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (params.page - 1) * params.pageSize, take: params.pageSize }),
  ])
  const stats = rows.length
    ? await prisma.order.groupBy({
        by: ['customerId'],
        where: { customerId: { in: rows.map(r => r.id) }, status: { not: 'CANCELLED' } },
        _sum: { total: true, amountReturned: true, amountPaid: true, amountRefunded: true },
        _count: true,
        _max: { placedAt: true },
      })
    : []
  return {
    total,
    items: rows.map((c) => {
      const s = stats.find(x => x.customerId === c.id)
      const sums = { total: s?._sum.total ?? 0, amountReturned: s?._sum.amountReturned ?? 0, amountPaid: s?._sum.amountPaid ?? 0, amountRefunded: s?._sum.amountRefunded ?? 0 }
      return {
        id: c.id, name: c.name, phone: c.phone, email: c.email, isActive: c.isActive, hasAccount: !!c.passwordHash, createdAt: c.createdAt,
        orderCount: s?._count ?? 0,
        totalPurchases: sums.total - sums.amountReturned,
        outstanding: outstandingBalance(sums),
        lastOrderAt: s?._max.placedAt ?? null,
      }
    }),
  }
}

export async function getCustomer(actor: Actor, id: string) {
  const c = await prisma.customer.findUnique({
    where: { id },
    include: { orders: { orderBy: { placedAt: 'desc' }, take: 50, select: { id: true, number: true, channel: true, status: true, paymentStatus: true, total: true, amountPaid: true, amountRefunded: true, amountReturned: true, placedAt: true } } },
  })
  if (!c) throw notFound('Customer')
  const { passwordHash, notes, ...rest } = c
  const live = c.orders.filter(o => o.status !== 'CANCELLED')
  return {
    ...rest,
    hasAccount: !!passwordHash,
    notes: can(actor, 'customers.notes') ? notes : undefined,
    totalPurchases: live.reduce((s, o) => s + o.total - o.amountReturned, 0),
    outstanding: live.reduce((s, o) => s + outstandingBalance(o), 0),
  }
}
