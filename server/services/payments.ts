import type { PaymentStatus } from '@prisma/client'
import type { Actor } from '../lib/actor'
import { assertCan } from '../lib/actor'
import { audit } from '../lib/audit'
import { conflict, invalid, isUniqueViolation, notFound } from '../lib/errors'
import { withTx, type Tx } from '../lib/prisma'
import { getSettings } from '../lib/settings'

/**
 * Payments are *records* of money received outside StyleGrab (cash, M-Pesa, bank, card terminal).
 * Nothing here talks to a gateway. A method with `requiresVerification` creates PENDING_CONFIRMATION records
 * that a user with `payments.verify` must confirm separately — entering a reference never proves payment.
 */

export interface PaymentInput {
  methodId: string
  amount: number
  tendered?: number | null
  reference?: string | null
  notes?: string | null
  receivedAt?: Date
  idempotencyKey?: string | null
}

export function normalizeReference(ref: string | null | undefined): string | null {
  const r = ref?.trim().toUpperCase().replace(/\s+/g, '')
  return r || null
}

/**
 * Derive the order payment status from its recorded amounts. Fulfilment status is never consulted.
 * netDue = total - returned goods; netPaid = confirmed - refunded.
 */
export function derivePaymentStatus(o: { total: number, amountPaid: number, amountPending: number, amountRefunded: number, amountReturned: number }): PaymentStatus {
  const netDue = o.total - o.amountReturned
  const netPaid = o.amountPaid - o.amountRefunded
  if (o.amountRefunded > 0) return netPaid <= 0 ? 'REFUNDED' : 'PARTIALLY_REFUNDED'
  if (netPaid >= netDue) return 'PAID'
  if (netPaid + o.amountPending >= netDue) return 'AWAITING_CONFIRMATION'
  if (netPaid + o.amountPending > 0) return 'PARTIALLY_PAID'
  return 'UNPAID'
}

export function outstandingBalance(o: { total: number, amountPaid: number, amountRefunded: number, amountReturned: number }): number {
  return Math.max(0, o.total - o.amountReturned - (o.amountPaid - o.amountRefunded))
}

/** Recompute cached payment totals from the authoritative payment/refund rows. Call inside the same transaction. */
export async function refreshOrderPayments(tx: Tx, orderId: string) {
  const [confirmed, pending, refunded] = await Promise.all([
    tx.paymentRecord.aggregate({ where: { orderId, status: 'CONFIRMED' }, _sum: { amount: true } }),
    tx.paymentRecord.aggregate({ where: { orderId, status: 'PENDING_CONFIRMATION' }, _sum: { amount: true } }),
    tx.refund.aggregate({ where: { orderId }, _sum: { amount: true } }),
  ])
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } })
  const next = { amountPaid: confirmed._sum.amount ?? 0, amountPending: pending._sum.amount ?? 0, amountRefunded: refunded._sum.amount ?? 0 }
  const paymentStatus = derivePaymentStatus({ ...order, ...next })
  return tx.order.update({ where: { id: orderId }, data: { ...next, paymentStatus } })
}

async function lockOrder(tx: Tx, orderId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`
  if (!rows.length) throw notFound('Order')
  return tx.order.findUniqueOrThrow({ where: { id: orderId } })
}

/**
 * Record a payment inside an existing transaction (used by POS checkout and the payments endpoint).
 * `atCounter`: taken in person at the POS — the cashier has seen the cash/M-Pesa message, so the record is
 * confirmed immediately and a reference is optional. Remote orders keep the verify-later workflow.
 */
export async function recordPaymentTx(tx: Tx, actor: Actor, orderId: string, input: PaymentInput, opts: { shiftId?: string | null, atCounter?: boolean } = {}) {
  if (input.idempotencyKey) {
    const existing = await tx.paymentRecord.findUnique({ where: { idempotencyKey: input.idempotencyKey } })
    if (existing) {
      if (existing.orderId !== orderId) throw conflict('idempotency_mismatch', 'This payment key was used for another order')
      return existing
    }
  }
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw invalid('invalid_amount', 'Payment amount must be greater than zero')

  const order = await lockOrder(tx, orderId)
  if (order.status === 'CANCELLED') throw conflict('order_cancelled', 'Payments cannot be recorded on a cancelled order')

  const method = await tx.paymentMethod.findUnique({ where: { id: input.methodId } })
  if (!method || !method.isActive) throw invalid('invalid_method', 'Choose an active payment method')
  if (method.type === 'EXCHANGE_CREDIT') throw invalid('invalid_method', 'Exchange credit is applied automatically by the returns workflow')

  const reference = normalizeReference(input.reference)
  if (method.requiresReference && !reference && !opts.atCounter) throw invalid('reference_required', `${method.name} payments need a transaction reference`)

  const due = order.total - order.amountReturned - (order.amountPaid - order.amountRefunded) - order.amountPending
  if (input.amount > due) {
    throw invalid('overpayment', due <= 0
      ? 'Nothing is outstanding on this order (pending payments are counted until they are verified or rejected)'
      : `Amount exceeds the outstanding balance of ${due / 100}. Record only the amount applied to this order.`, { due })
  }
  if (input.tendered != null && (method.type !== 'CASH' || input.tendered < input.amount)) throw invalid('invalid_tendered', 'Cash tendered must be at least the amount applied')

  let shiftId: string | null = opts.shiftId ?? null
  if (method.type === 'CASH') {
    const settings = await getSettings(tx)
    if (shiftId) {
      const shift = await tx.posShift.findUnique({ where: { id: shiftId } })
      if (!shift || shift.status !== 'OPEN') throw conflict('shift_closed', 'The cash shift is not open')
    }
    else if (settings.requireOpenShiftForCash && order.channel === 'POS') {
      throw conflict('shift_required', 'Open a cash shift before recording cash sales')
    }
  }
  else shiftId = opts.shiftId ?? null

  if (reference) {
    const dup = await tx.paymentRecord.findFirst({ where: { methodId: method.id, reference, status: { in: ['PENDING_CONFIRMATION', 'CONFIRMED'] } }, include: { order: { select: { number: true } } } })
    if (dup) throw conflict('duplicate_reference', `Reference ${reference} is already recorded on order ${dup.order.number}`)
  }

  const status = method.requiresVerification && !opts.atCounter ? 'PENDING_CONFIRMATION' : 'CONFIRMED'
  try {
    const payment = await tx.paymentRecord.create({
      data: {
        orderId,
        methodId: method.id,
        amount: input.amount,
        tendered: input.tendered ?? null,
        status,
        reference,
        notes: input.notes ?? null,
        receivedAt: input.receivedAt ?? new Date(),
        recordedById: actor.userId,
        verifiedById: status === 'CONFIRMED' ? actor.userId : null,
        verifiedAt: status === 'CONFIRMED' ? new Date() : null,
        shiftId,
        idempotencyKey: input.idempotencyKey ?? null,
      },
    })
    await refreshOrderPayments(tx, orderId)
    await audit(tx, actor, { action: 'payment.record', entityType: 'order', entityId: orderId, after: { paymentId: payment.id, method: method.code, amount: input.amount, reference, status, atCounter: !!opts.atCounter } })
    return payment
  }
  catch (e) {
    // Concurrent insert of the same reference: the partial unique index is the backstop. The transaction is
    // aborted at this point, so no further queries are possible.
    if (isUniqueViolation(e)) throw conflict('duplicate_reference', `Reference ${reference ?? ''} is already recorded`)
    throw e
  }
}

export async function recordPayment(actor: Actor, orderId: string, input: PaymentInput, opts: { shiftId?: string | null } = {}) {
  assertCan(actor, 'payments.record')
  try {
    return await withTx(tx => recordPaymentTx(tx, actor, orderId, input, opts))
  }
  catch (e) {
    // A concurrent insert of the same reference surfaces as a raw unique violation at commit.
    if (isUniqueViolation(e)) throw conflict('duplicate_reference', 'This payment reference is already recorded')
    throw e
  }
}

/** Confirm (verified as received) or reject (failed) a payment awaiting confirmation. */
export async function verifyPayment(actor: Actor, paymentId: string, input: { approve: boolean, note?: string | null }) {
  assertCan(actor, 'payments.verify')
  return withTx(async (tx) => {
    const p = await tx.paymentRecord.findUnique({ where: { id: paymentId } })
    if (!p) throw notFound('Payment')
    await lockOrder(tx, p.orderId)
    const res = await tx.paymentRecord.updateMany({
      where: { id: paymentId, status: 'PENDING_CONFIRMATION' },
      data: { status: input.approve ? 'CONFIRMED' : 'FAILED', verifiedById: actor.userId, verifiedAt: new Date(), verificationNote: input.note ?? null },
    })
    if (!res.count) throw conflict('not_pending', 'Only payments awaiting confirmation can be verified')
    const order = await refreshOrderPayments(tx, p.orderId)
    await audit(tx, actor, { action: input.approve ? 'payment.verify' : 'payment.reject', entityType: 'order', entityId: p.orderId, before: { paymentId, status: p.status }, after: { status: input.approve ? 'CONFIRMED' : 'FAILED' }, reason: input.note })
    return order
  })
}

/** Void a record entered in error. This is not a refund — use returns/refunds for money given back. */
export async function voidPayment(actor: Actor, paymentId: string, reason: string) {
  assertCan(actor, 'payments.void')
  if (!reason?.trim()) throw invalid('reason_required', 'A reason is required to void a payment')
  return withTx(async (tx) => {
    const p = await tx.paymentRecord.findUnique({ where: { id: paymentId } })
    if (!p) throw notFound('Payment')
    const order = await lockOrder(tx, p.orderId)
    if (p.status === 'VOIDED' || p.status === 'FAILED') throw conflict('already_void', 'This payment is not active')
    if (p.status === 'CONFIRMED' && order.amountPaid - p.amount < order.amountRefunded) throw conflict('refunded', 'Refunds have been issued against this payment; it cannot be voided')
    await tx.paymentRecord.update({ where: { id: paymentId }, data: { status: 'VOIDED', verificationNote: reason } })
    const updated = await refreshOrderPayments(tx, p.orderId)
    await audit(tx, actor, { action: 'payment.void', entityType: 'order', entityId: p.orderId, before: { paymentId, status: p.status, amount: p.amount }, after: { status: 'VOIDED' }, reason })
    return updated
  })
}
