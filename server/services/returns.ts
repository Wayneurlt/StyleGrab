import type { ReturnItemCondition, ReturnResolution } from '@prisma/client'
import { divRound } from '../../shared/money'
import type { Actor } from '../lib/actor'
import { assertCan } from '../lib/actor'
import { audit } from '../lib/audit'
import { conflict, invalid, isUniqueViolation, notFound } from '../lib/errors'
import { nextNumber } from '../lib/numbering'
import { prisma, withTx, type Tx } from '../lib/prisma'
import { getSettings } from '../lib/settings'
import { applyMovement } from './inventory'
import { createOrderTx, type DiscountInput, type LineInput } from './orders'
import { recordPaymentTx, refreshOrderPayments, type PaymentInput } from './payments'

export interface ReturnInput {
  orderId: string
  idempotencyKey: string
  reason: string
  notes?: string | null
  resolution: ReturnResolution
  items: { orderItemId: string, quantity: number, condition: ReturnItemCondition }[]
  /** REFUND: money given back. EXCHANGE: refund of any credit left after the replacement items. */
  refund?: { methodId: string, amount: number, reference?: string | null, notes?: string | null } | null
  exchange?: { lines: LineInput[], orderDiscount?: DiscountInput | null, payments?: PaymentInput[] } | null
  shiftId?: string | null
}

/** Credit for returning `qty` more units, computed cumulatively so repeated partial returns never exceed the line total. */
export function returnCredit(lineTotal: number, quantity: number, alreadyReturned: number, qty: number): number {
  return divRound(lineTotal * (alreadyReturned + qty), quantity) - divRound(lineTotal * alreadyReturned, quantity)
}

/**
 * Process a return (and optionally an exchange) against a completed order. The original order is never deleted
 * or edited beyond its returned quantities/amounts. Stock comes back only for SALEABLE items.
 */
export async function createReturn(actor: Actor, input: ReturnInput) {
  assertCan(actor, 'returns.create')
  if (!input.reason.trim()) throw invalid('reason_required', 'A return reason is required')
  if (!input.items.length) throw invalid('empty_return', 'Select at least one item to return')
  if (input.resolution === 'EXCHANGE' && !input.exchange?.lines.length) throw invalid('exchange_items_required', 'Choose the replacement items for the exchange')
  if (input.resolution !== 'EXCHANGE' && input.exchange) throw invalid('invalid_resolution', 'Replacement items are only valid for exchanges')

  try {
    return await withTx(async (tx) => {
      const existing = await tx.return.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: { items: true, refunds: true } })
      if (existing) return existing

      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Order" WHERE "id" = ${input.orderId} FOR UPDATE`
      if (!locked.length) throw notFound('Order')
      const order = await tx.order.findUniqueOrThrow({ where: { id: input.orderId }, include: { items: true } })
      if (order.status !== 'COMPLETED') throw conflict('not_returnable', 'Only completed orders can be returned. Cancel open orders instead.')

      const number = await nextNumber(tx, 'return')
      let credit = 0
      const itemRows: { orderItemId: string, quantity: number, condition: ReturnItemCondition, creditAmount: number, variantId: string, unitCost: number | null }[] = []
      const seen = new Set<string>()
      for (const ri of input.items) {
        if (seen.has(ri.orderItemId)) throw invalid('duplicate_line', 'Each item may appear once per return')
        seen.add(ri.orderItemId)
        const oi = order.items.find(i => i.id === ri.orderItemId)
        if (!oi) throw notFound('Order item')
        if (!Number.isInteger(ri.quantity) || ri.quantity <= 0) throw invalid('invalid_quantity', 'Return quantities must be positive whole numbers')
        // Conditional update guards against concurrent returns over-returning the same line.
        const upd = await tx.orderItem.updateMany({ where: { id: oi.id, returnedQty: { lte: oi.quantity - ri.quantity } }, data: { returnedQty: { increment: ri.quantity } } })
        if (!upd.count) throw conflict('return_exceeds_purchase', `Only ${oi.quantity - oi.returnedQty} of ${oi.sku} can still be returned`)
        const c = returnCredit(oi.lineTotal, oi.quantity, oi.returnedQty, ri.quantity)
        credit += c
        itemRows.push({ orderItemId: oi.id, quantity: ri.quantity, condition: ri.condition, creditAmount: c, variantId: oi.variantId, unitCost: oi.unitCost })
      }

      const ret = await tx.return.create({
        data: {
          number,
          orderId: order.id,
          reason: input.reason.trim(),
          resolution: input.resolution,
          creditAmount: credit,
          notes: input.notes ?? null,
          createdById: actor.userId ?? 'system',
          idempotencyKey: input.idempotencyKey,
          items: { create: itemRows.map(r => ({ orderItemId: r.orderItemId, quantity: r.quantity, condition: r.condition, creditAmount: r.creditAmount, restocked: r.condition === 'SALEABLE' })) },
        },
        include: { items: true },
      })

      for (const r of ret.items) {
        if (r.condition !== 'SALEABLE') continue
        const src = itemRows.find(x => x.orderItemId === r.orderItemId)!
        await applyMovement(tx, {
          variantId: src.variantId, type: 'RETURN_TO_STOCK', qtyOnHand: r.quantity, costIn: src.unitCost,
          reason: input.reason, referenceType: 'return', referenceId: ret.id, referenceLabel: number, dedupeKey: `RTN:${r.id}`, userId: actor.userId,
        })
      }

      await tx.order.update({ where: { id: order.id }, data: { amountReturned: { increment: credit } } })
      const afterReturn = await refreshOrderPayments(tx, order.id)
      // Money the customer has paid beyond what they now owe on the original order.
      const refundable = Math.max(0, (afterReturn.amountPaid - afterReturn.amountRefunded) - (afterReturn.total - afterReturn.amountReturned))
      const settings = await getSettings(tx)
      let creditLeft = Math.min(credit, refundable)

      let exchangeOrderId: string | null = null
      if (input.resolution === 'EXCHANGE' && input.exchange) {
        const exchangeMethod = await tx.paymentMethod.findFirst({ where: { type: 'EXCHANGE_CREDIT' } })
        if (!exchangeMethod) throw conflict('missing_method', 'The exchange-credit payment method is not configured')
        const newOrder = await createOrderTx(tx, actor, {
          mode: 'pos',
          idempotencyKey: `${input.idempotencyKey}:exchange`,
          lines: input.exchange.lines,
          orderDiscount: input.exchange.orderDiscount,
          customerId: order.customerId,
          contact: { name: order.contactName, phone: order.contactPhone, email: order.contactEmail },
          shiftId: input.shiftId,
          exchangeFromReturnId: ret.id,
          internalNote: `Exchange for return ${number} (order ${order.number})`,
        })
        exchangeOrderId = newOrder.id
        const applied = Math.min(creditLeft, newOrder.total)
        if (applied > 0) {
          // Move the credit: a refund on the original order paired with an exchange-credit payment on the new one.
          await tx.refund.create({ data: { returnId: ret.id, orderId: order.id, methodId: exchangeMethod.id, amount: applied, notes: `Applied to ${newOrder.number}`, recordedById: actor.userId ?? 'system' } })
          await tx.paymentRecord.create({ data: { orderId: newOrder.id, methodId: exchangeMethod.id, amount: applied, status: 'CONFIRMED', reference: number, recordedById: actor.userId, verifiedById: actor.userId, verifiedAt: new Date(), notes: `Credit from return ${number}` } })
          await refreshOrderPayments(tx, newOrder.id)
          creditLeft -= applied
        }
        for (const p of input.exchange.payments ?? []) await recordPaymentTx(tx, actor, newOrder.id, p, { shiftId: input.shiftId })
      }

      if (input.refund && input.refund.amount > 0) {
        if (input.resolution === 'NO_REFUND') throw invalid('invalid_refund', 'This return was marked as no refund')
        if (!Number.isInteger(input.refund.amount) || input.refund.amount > creditLeft) {
          throw invalid('refund_exceeds_credit', creditLeft === 0 ? 'Nothing is refundable: the order was not paid beyond what is still owed' : `The refund cannot exceed ${creditLeft / 100}`, { refundable: creditLeft })
        }
        const method = await tx.paymentMethod.findUnique({ where: { id: input.refund.methodId } })
        if (!method || !method.isActive || method.type === 'EXCHANGE_CREDIT') throw invalid('invalid_method', 'Choose an active refund method')
        let shiftId: string | null = input.shiftId ?? null
        if (method.type === 'CASH') {
          if (shiftId) {
            const shift = await tx.posShift.findUnique({ where: { id: shiftId } })
            if (!shift || shift.status !== 'OPEN') throw conflict('shift_closed', 'The cash shift is not open')
          }
          else if (settings.requireOpenShiftForCash) throw conflict('shift_required', 'Open a cash shift to pay out cash refunds')
        }
        else shiftId = null
        await tx.refund.create({ data: { returnId: ret.id, orderId: order.id, methodId: method.id, amount: input.refund.amount, reference: input.refund.reference?.trim().toUpperCase() || null, notes: input.refund.notes ?? null, shiftId, recordedById: actor.userId ?? 'system' } })
      }
      await refreshOrderPayments(tx, order.id)

      await audit(tx, actor, {
        action: input.resolution === 'EXCHANGE' ? 'return.exchange' : 'return.create',
        entityType: 'order',
        entityId: order.id,
        after: { return: number, credit, refund: input.refund?.amount ?? 0, items: itemRows.map(r => ({ orderItemId: r.orderItemId, qty: r.quantity, condition: r.condition })), exchangeOrderId },
        reason: input.reason,
      })
      return tx.return.findUniqueOrThrow({ where: { id: ret.id }, include: { items: true, refunds: true } })
    }, { timeout: 60_000 })
  }
  catch (e) {
    if (isUniqueViolation(e, 'idempotencyKey')) {
      const r = await prisma.return.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: { items: true, refunds: true } })
      if (r) return r
    }
    throw e
  }
}

/** Resolve an item returned as NEEDS_INSPECTION: restock it, or write it off (no stock change). */
export async function resolveInspection(actor: Actor, returnItemId: string, saleable: boolean) {
  assertCan(actor, 'returns.create')
  return withTx(async (tx: Tx) => {
    const item = await tx.returnItem.findUnique({ where: { id: returnItemId }, include: { return: true, orderItem: true } })
    if (!item) throw notFound('Return item')
    if (item.condition !== 'NEEDS_INSPECTION' || item.resolvedAt) throw conflict('already_resolved', 'This item does not need inspection')
    const upd = await tx.returnItem.updateMany({ where: { id: item.id, resolvedAt: null }, data: { resolvedAt: new Date(), resolvedById: actor.userId, restocked: saleable } })
    if (!upd.count) throw conflict('already_resolved', 'This item was already resolved')
    if (saleable) {
      await applyMovement(tx, {
        variantId: item.orderItem.variantId, type: 'RETURN_TO_STOCK', qtyOnHand: item.quantity, costIn: item.orderItem.unitCost,
        reason: 'Passed inspection', referenceType: 'return', referenceId: item.returnId, referenceLabel: item.return.number, dedupeKey: `RTN:${item.id}`, userId: actor.userId,
      })
    }
    await audit(tx, actor, { action: saleable ? 'return.inspection.restock' : 'return.inspection.writeoff', entityType: 'order', entityId: item.return.orderId, after: { returnItemId, quantity: item.quantity } })
  })
}
