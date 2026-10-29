import type { FulfilmentType, OrderStatus, Prisma, SalesChannel } from '@prisma/client'
import { allocate, percentOf } from '../../shared/money'
import { ORDER_TRANSITIONS } from '../../shared/labels'
import type { Actor } from '../lib/actor'
import { assertCan, can } from '../lib/actor'
import { audit } from '../lib/audit'
import { conflict, DomainError, forbidden, invalid, isUniqueViolation, notFound } from '../lib/errors'
import { nextNumber } from '../lib/numbering'
import { prisma, withTx, type Tx } from '../lib/prisma'
import { getSettings, type Settings } from '../lib/settings'
import { findOrCreateCustomerTx } from './customers'
import { applyMovement } from './inventory'
import { recordPaymentTx, type PaymentInput } from './payments'

export interface DiscountInput {
  type: 'FIXED' | 'PERCENT'
  /** FIXED: minor units. PERCENT: basis points (10% = 1000). */
  value: number
}

export interface LineInput {
  variantId: string
  quantity: number
  /** Staff-only unit price override (minor units). */
  unitPrice?: number | null
  discount?: DiscountInput | null
}

export interface PricedLine {
  variantId: string
  productId: string
  productName: string
  variantTitle: string
  sku: string
  quantity: number
  listPrice: number
  unitPrice: number
  lineDiscount: number
  orderDiscountShare: number
  lineTotal: number
}

export interface PricedCart {
  lines: PricedLine[]
  subtotal: number
  discountTotal: number
  total: number
}

function discountAmount(base: number, d: DiscountInput | null | undefined): number {
  if (!d || d.value === 0) return 0
  if (!Number.isInteger(d.value) || d.value < 0) throw invalid('invalid_discount', 'Discounts must be positive')
  const amount = d.type === 'PERCENT' ? percentOf(base, Math.min(d.value, 10_000)) : d.value
  if (amount > base) throw invalid('invalid_discount', 'A discount cannot exceed the amount it applies to')
  return amount
}

/**
 * Server-side pricing. Prices always come from the catalogue; staff overrides and discounts are permission-checked.
 * The browser's totals are never trusted.
 */
export async function priceLines(
  db: Tx | typeof prisma,
  actor: Actor,
  lines: LineInput[],
  orderDiscount: DiscountInput | null | undefined,
  opts: { staff: boolean, settings: Settings },
): Promise<PricedCart> {
  if (!lines.length) throw invalid('empty_order', 'Add at least one item')
  for (const l of lines) {
    if (!Number.isInteger(l.quantity) || l.quantity <= 0 || l.quantity > 999) throw invalid('invalid_quantity', 'Quantities must be whole numbers between 1 and 999')
  }
  const variants = await db.productVariant.findMany({
    where: { id: { in: [...new Set(lines.map(l => l.variantId))] } },
    include: { product: { select: { id: true, name: true, price: true, status: true } } },
  })

  const priced: PricedLine[] = lines.map((l) => {
    const v = variants.find(x => x.id === l.variantId)
    if (!v) throw notFound('Product variant')
    if (v.isArchived || v.product.status !== 'ACTIVE') {
      if (!(opts.staff && v.product.status === 'DRAFT' && !v.isArchived)) throw new DomainError('unavailable', `${v.product.name} (${v.title}) is no longer available`, 409, { variantId: v.id })
    }
    const listPrice = v.price ?? v.product.price
    let unitPrice = listPrice
    if (l.unitPrice != null && l.unitPrice !== listPrice) {
      if (!opts.staff || !can(actor, 'pos.price.override')) throw forbidden('You do not have permission to override prices')
      if (!Number.isInteger(l.unitPrice) || l.unitPrice < 0) throw invalid('invalid_price', 'Prices must be non-negative')
      unitPrice = l.unitPrice
    }
    const gross = unitPrice * l.quantity
    const lineDiscount = discountAmount(gross, l.discount)
    return { variantId: v.id, productId: v.product.id, productName: v.product.name, variantTitle: v.title, sku: v.sku, quantity: l.quantity, listPrice, unitPrice, lineDiscount, orderDiscountShare: 0, lineTotal: gross - lineDiscount }
  })

  const afterLine = priced.reduce((s, l) => s + l.lineTotal, 0)
  const orderDisc = discountAmount(afterLine, orderDiscount)
  if (orderDisc > 0) {
    const shares = allocate(orderDisc, priced.map(l => l.lineTotal))
    priced.forEach((l, i) => {
      l.orderDiscountShare = shares[i]!
      l.lineTotal -= shares[i]!
    })
  }

  const subtotal = priced.reduce((s, l) => s + l.unitPrice * l.quantity, 0)
  const discountTotal = priced.reduce((s, l) => s + l.lineDiscount + l.orderDiscountShare, 0)
  if (discountTotal > 0) {
    if (!opts.staff || !can(actor, 'pos.discount')) throw forbidden('You do not have permission to apply discounts')
    const bps = subtotal === 0 ? 0 : Math.round((discountTotal * 10_000) / subtotal)
    if (bps > opts.settings.maxDiscountBpsWithoutOverride && !can(actor, 'pos.discount.override')) {
      throw forbidden(`Discounts above ${opts.settings.maxDiscountBpsWithoutOverride / 100}% need manager approval`)
    }
  }
  return { lines: priced, subtotal, discountTotal, total: subtotal - discountTotal }
}

export type OrderMode = 'pos' | 'web' | 'manual'

export interface CreateOrderInput {
  mode: OrderMode
  channel?: SalesChannel
  idempotencyKey: string
  lines: LineInput[]
  orderDiscount?: DiscountInput | null
  customerId?: string | null
  contact?: { name?: string | null, phone?: string | null, email?: string | null, address?: string | null } | null
  fulfilmentType?: FulfilmentType
  customerNote?: string | null
  internalNote?: string | null
  payments?: PaymentInput[]
  shiftId?: string | null
  assignedToId?: string | null
  /** Set by the returns workflow when this order is the outgoing side of an exchange. */
  exchangeFromReturnId?: string | null
}

const ORDER_INCLUDE = {
  items: true,
  payments: { include: { method: true }, orderBy: { createdAt: 'asc' } },
  customer: { select: { id: true, name: true, phone: true, email: true } },
} satisfies Prisma.OrderInclude

/**
 * Create an order for any channel. Stock handling:
 *  - POS: stock is deducted immediately (SALE) and the order is COMPLETED.
 *  - Website / manual: stock is reserved (RESERVATION); it is deducted when the order is completed and
 *    released if it is cancelled or the website reservation expires.
 * Idempotent by `idempotencyKey`: a retried submission returns the original order and touches no stock.
 */
export async function createOrderTx(tx: Tx, actor: Actor, input: CreateOrderInput) {
  const existing = await tx.order.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: ORDER_INCLUDE })
  if (existing) return existing

  const settings = await getSettings(tx)
  const staff = input.mode !== 'web'
  if (input.mode === 'pos') assertCan(actor, 'pos.sell')
  if (input.mode === 'manual') assertCan(actor, 'orders.manage')
  if (input.mode === 'web' && (input.orderDiscount || input.lines.some(l => l.discount || l.unitPrice != null))) throw forbidden('Discounts are not available at checkout')

  const channel: SalesChannel = input.mode === 'pos' ? 'POS' : input.mode === 'web' ? 'WEBSITE' : (input.channel ?? 'OTHER')
  if (input.mode === 'manual' && (channel === 'POS' || channel === 'WEBSITE')) throw invalid('invalid_channel', 'Manual orders must use an external channel (WhatsApp, Instagram, ...)')

  const priced = await priceLines(tx, actor, input.lines, input.orderDiscount, { staff, settings })

  let customerId = input.customerId ?? null
  if (customerId) {
    const c = await tx.customer.findUnique({ where: { id: customerId } })
    if (!c || !c.isActive) throw notFound('Customer')
  }
  else if (input.contact?.phone || input.contact?.email) {
    customerId = (await findOrCreateCustomerTx(tx, { name: input.contact.name || 'Customer', phone: input.contact.phone, email: input.contact.email })).id
  }
  if (input.mode === 'web' && !customerId) throw invalid('contact_required', 'A phone number or email is required to place an order')

  if (input.shiftId) {
    const shift = await tx.posShift.findUnique({ where: { id: input.shiftId } })
    if (!shift || shift.status !== 'OPEN') throw conflict('shift_closed', 'The selected cash shift is not open')
  }

  const now = new Date()
  const number = await nextNumber(tx, 'order')
  const status: OrderStatus = input.mode === 'pos' ? 'COMPLETED' : input.mode === 'manual' ? 'CONFIRMED' : 'PENDING'
  const order = await tx.order.create({
    data: {
      number,
      channel,
      status,
      fulfilmentType: input.fulfilmentType ?? (input.mode === 'pos' ? 'IN_STORE' : 'PICKUP'),
      customerId,
      contactName: input.contact?.name?.trim() || null,
      contactPhone: input.contact?.phone?.trim() || null,
      contactEmail: input.contact?.email?.trim().toLowerCase() || null,
      shippingAddress: input.contact?.address?.trim() || null,
      customerNote: input.customerNote ?? null,
      internalNote: input.internalNote ?? null,
      subtotal: priced.subtotal,
      discountTotal: priced.discountTotal,
      total: priced.total,
      orderDiscountType: input.orderDiscount?.type ?? null,
      orderDiscountValue: input.orderDiscount?.value ?? null,
      idempotencyKey: input.idempotencyKey,
      createdById: actor.userId,
      assignedToId: input.assignedToId ?? null,
      shiftId: input.shiftId ?? null,
      exchangeFromReturnId: input.exchangeFromReturnId ?? null,
      reservationExpiresAt: input.mode === 'web' ? new Date(now.getTime() + settings.reservationHours * 3_600_000) : null,
      placedAt: now,
      confirmedAt: status !== 'PENDING' ? now : null,
      completedAt: status === 'COMPLETED' ? now : null,
      paymentStatus: priced.total === 0 ? 'PAID' : 'UNPAID',
      items: { create: priced.lines.map(l => ({ ...l })) },
      statusHistory: { create: { toStatus: status, userId: actor.userId, note: `Created via ${channel}` } },
    },
    include: { items: true },
  })

  for (const item of order.items) {
    if (input.mode === 'pos') {
      const res = await applyMovement(tx, {
        variantId: item.variantId, type: 'SALE', qtyOnHand: -item.quantity,
        referenceType: 'order', referenceId: order.id, referenceLabel: number, dedupeKey: `SALE:${item.id}`, userId: actor.userId,
      })
      await tx.orderItem.update({ where: { id: item.id }, data: { unitCost: res.avgCostBefore } })
    }
    else {
      await applyMovement(tx, {
        variantId: item.variantId, type: 'RESERVATION', qtyReserved: item.quantity,
        referenceType: 'order', referenceId: order.id, referenceLabel: number, dedupeKey: `RES:${item.id}`, userId: actor.userId,
      })
    }
  }

  for (const p of input.payments ?? []) {
    if (!can(actor, 'payments.record')) throw forbidden('You do not have permission to record payments')
    await recordPaymentTx(tx, actor, order.id, p, { shiftId: input.shiftId, atCounter: input.mode === 'pos' })
  }

  await audit(tx, actor, {
    action: input.mode === 'pos' ? 'sale.create' : 'order.create',
    entityType: 'order',
    entityId: order.id,
    after: { number, channel, total: priced.total, discountTotal: priced.discountTotal, overrides: priced.lines.filter(l => l.unitPrice !== l.listPrice).map(l => ({ sku: l.sku, listPrice: l.listPrice, unitPrice: l.unitPrice })) },
  })
  return tx.order.findUniqueOrThrow({ where: { id: order.id }, include: ORDER_INCLUDE })
}

export async function createOrder(actor: Actor, input: CreateOrderInput) {
  try {
    return await withTx(tx => createOrderTx(tx, actor, input), { timeout: 60_000 })
  }
  catch (e) {
    // Two identical submissions racing: the loser hits the idempotency unique index. Return the winner.
    if (isUniqueViolation(e, 'idempotencyKey')) {
      const order = await prisma.order.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: ORDER_INCLUDE })
      if (order) return order
    }
    throw e
  }
}

async function lockOrder(tx: Tx, orderId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`
  if (!rows.length) throw notFound('Order')
  return tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } })
}

async function releaseReservations(tx: Tx, actor: Actor, order: { id: string, number: string, items: { id: string, variantId: string, quantity: number }[] }, reason: string) {
  for (const item of order.items) {
    const reserved = await tx.inventoryMovement.findUnique({ where: { dedupeKey: `RES:${item.id}` } })
    if (!reserved) continue
    await applyMovement(tx, {
      variantId: item.variantId, type: 'RESERVATION_RELEASE', qtyReserved: -item.quantity, reason,
      referenceType: 'order', referenceId: order.id, referenceLabel: order.number, dedupeKey: `REL:${item.id}`, userId: actor.userId,
    })
  }
}

/** Fulfilment state machine. Payment status is independent and never changed here. */
export async function transitionOrder(actor: Actor, orderId: string, to: OrderStatus, note?: string | null) {
  assertCan(actor, to === 'CANCELLED' ? 'orders.cancel' : 'orders.manage')
  return withTx(async (tx) => {
    const order = await lockOrder(tx, orderId)
    if (!ORDER_TRANSITIONS[order.status]?.includes(to)) throw conflict('invalid_transition', `An order that is ${order.status.toLowerCase()} cannot be moved to ${to.toLowerCase()}`)

    const now = new Date()
    const data: Prisma.OrderUpdateInput = { status: to }
    if (to === 'CONFIRMED') {
      data.confirmedAt = now
      data.reservationExpiresAt = null
    }
    if (to === 'COMPLETED') {
      data.completedAt = now
      data.reservationExpiresAt = null
      // Convert reservations into the sale deduction — exactly once per line (dedupe key).
      for (const item of order.items) {
        const res = await applyMovement(tx, {
          variantId: item.variantId, type: 'SALE', qtyOnHand: -item.quantity, qtyReserved: -item.quantity,
          referenceType: 'order', referenceId: order.id, referenceLabel: order.number, dedupeKey: `SALE:${item.id}`, userId: actor.userId,
        })
        if (!res.duplicate) await tx.orderItem.update({ where: { id: item.id }, data: { unitCost: res.avgCostBefore } })
      }
    }
    if (to === 'CANCELLED') {
      if (order.amountPaid - order.amountRefunded > 0 || order.amountPending > 0) {
        throw conflict('payments_outstanding', 'This order has recorded payments. Void or reject pending payments and refund confirmed ones before cancelling.')
      }
      data.cancelledAt = now
      data.cancelReason = note ?? null
      data.reservationExpiresAt = null
      await releaseReservations(tx, actor, order, note ?? 'Order cancelled')
    }

    const updated = await tx.order.update({ where: { id: orderId }, data })
    await tx.orderStatusEvent.create({ data: { orderId, fromStatus: order.status, toStatus: to, note: note ?? null, userId: actor.userId } })
    await audit(tx, actor, { action: `order.${to.toLowerCase()}`, entityType: 'order', entityId: orderId, before: { status: order.status }, after: { status: to }, reason: note })
    return updated
  })
}

/**
 * Cancel website orders whose reservation window passed without confirmation or any payment record.
 * Safe to run repeatedly and concurrently (each order is locked and re-checked).
 */
export async function expireStaleReservations(actor: Actor, now = new Date()): Promise<number> {
  const stale = await prisma.order.findMany({
    where: { status: 'PENDING', reservationExpiresAt: { lt: now }, amountPaid: 0, amountPending: 0 },
    select: { id: true },
    take: 100,
  })
  let expired = 0
  for (const { id } of stale) {
    await withTx(async (tx) => {
      const order = await lockOrder(tx, id)
      if (order.status !== 'PENDING' || !order.reservationExpiresAt || order.reservationExpiresAt >= now || order.amountPaid > 0 || order.amountPending > 0) return
      await releaseReservations(tx, actor, order, 'Reservation expired')
      await tx.order.update({ where: { id }, data: { status: 'CANCELLED', cancelledAt: now, cancelReason: 'Reservation expired', reservationExpiresAt: null } })
      await tx.orderStatusEvent.create({ data: { orderId: id, fromStatus: 'PENDING', toStatus: 'CANCELLED', note: 'Reservation expired', userId: actor.userId } })
      await audit(tx, actor, { action: 'order.expire', entityType: 'order', entityId: id })
      expired++
    })
  }
  return expired
}

export async function updateOrderNotes(actor: Actor, orderId: string, input: { internalNote?: string | null, assignedToId?: string | null }) {
  assertCan(actor, 'orders.manage')
  return withTx(async (tx) => {
    const before = await tx.order.findUnique({ where: { id: orderId } })
    if (!before) throw notFound('Order')
    const updated = await tx.order.update({ where: { id: orderId }, data: { internalNote: input.internalNote, assignedToId: input.assignedToId } })
    await audit(tx, actor, { action: 'order.update', entityType: 'order', entityId: orderId, before: { internalNote: before.internalNote, assignedToId: before.assignedToId }, after: input })
    return updated
  })
}

export async function getOrderDetail(idOrNumber: string) {
  const order = await prisma.order.findFirst({
    where: { OR: [{ id: idOrNumber }, { number: idOrNumber.toUpperCase() }] },
    include: {
      ...ORDER_INCLUDE,
      statusHistory: { orderBy: { createdAt: 'asc' } },
      returns: { include: { items: true, refunds: { include: { method: true } } }, orderBy: { createdAt: 'asc' } },
      shift: { select: { id: true, register: { select: { name: true } } } },
    },
  })
  if (!order) throw notFound('Order')
  const refunds = await prisma.refund.findMany({ where: { orderId: order.id }, include: { method: true }, orderBy: { createdAt: 'asc' } })
  const userIds = [...new Set([
    order.createdById, order.assignedToId,
    ...order.payments.flatMap(p => [p.recordedById, p.verifiedById]),
    ...order.statusHistory.map(h => h.userId),
    ...order.returns.map(r => r.createdById),
    ...refunds.map(r => r.recordedById),
  ].filter((x): x is string => !!x))]
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
  // Replacement sales created by exchanges, and (for a replacement) the order it came from.
  const exchangeOrders = order.returns.length
    ? await prisma.order.findMany({ where: { exchangeFromReturnId: { in: order.returns.map(r => r.id) } }, select: { id: true, number: true, exchangeFromReturnId: true } })
    : []
  const exchangedFrom = order.exchangeFromReturnId
    ? await prisma.return.findUnique({ where: { id: order.exchangeFromReturnId }, select: { number: true, order: { select: { id: true, number: true } } } })
    : null
  return {
    ...order,
    refunds,
    users: Object.fromEntries(users.map(u => [u.id, u.name])),
    exchangeOrders: Object.fromEntries(exchangeOrders.map(o => [o.exchangeFromReturnId!, { id: o.id, number: o.number }])),
    exchangedFrom,
  }
}
