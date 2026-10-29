import type { CashMovementType } from '@prisma/client'
import type { Actor } from '../lib/actor'
import { assertCan, can } from '../lib/actor'
import { audit } from '../lib/audit'
import { conflict, forbidden, invalid, isUniqueViolation, notFound } from '../lib/errors'
import { prisma, withTx, type Tx } from '../lib/prisma'

/**
 * Cash shifts reconcile the physical drawer only. Expected cash =
 *   opening float + confirmed CASH payments + pay-ins − CASH refunds − pay-outs.
 * Non-cash payments are summarised separately and never affect the drawer.
 */
export async function shiftSummary(db: Tx | typeof prisma, shiftId: string) {
  const shift = await db.posShift.findUnique({ where: { id: shiftId }, include: { register: true, cashMovements: { orderBy: { createdAt: 'asc' } } } })
  if (!shift) throw notFound('Shift')
  const payments = await db.paymentRecord.groupBy({ by: ['methodId', 'status'], where: { shiftId }, _sum: { amount: true }, _count: true })
  const refunds = await db.refund.groupBy({ by: ['methodId'], where: { shiftId }, _sum: { amount: true } })
  const methods = await db.paymentMethod.findMany()
  const cashIds = new Set(methods.filter(m => m.type === 'CASH').map(m => m.id))

  const cashSales = payments.filter(p => cashIds.has(p.methodId) && p.status === 'CONFIRMED').reduce((s, p) => s + (p._sum.amount ?? 0), 0)
  const cashRefunds = refunds.filter(r => cashIds.has(r.methodId)).reduce((s, r) => s + (r._sum.amount ?? 0), 0)
  const payIns = shift.cashMovements.filter(m => m.type === 'PAY_IN').reduce((s, m) => s + m.amount, 0)
  const payOuts = shift.cashMovements.filter(m => m.type === 'PAY_OUT').reduce((s, m) => s + m.amount, 0)
  const expectedCash = shift.openingCash + cashSales + payIns - cashRefunds - payOuts

  const byMethod = methods.map(m => ({
    methodId: m.id,
    name: m.name,
    type: m.type,
    confirmed: payments.filter(p => p.methodId === m.id && p.status === 'CONFIRMED').reduce((s, p) => s + (p._sum.amount ?? 0), 0),
    pending: payments.filter(p => p.methodId === m.id && p.status === 'PENDING_CONFIRMATION').reduce((s, p) => s + (p._sum.amount ?? 0), 0),
    refunded: refunds.filter(r => r.methodId === m.id).reduce((s, r) => s + (r._sum.amount ?? 0), 0),
  })).filter(m => m.confirmed || m.pending || m.refunded)

  const salesCount = await db.order.count({ where: { shiftId, status: 'COMPLETED' } })
  return { shift, cashSales, cashRefunds, payIns, payOuts, expectedCash, byMethod, salesCount }
}

export async function openShift(actor: Actor, input: { registerId: string, openingCash: number }) {
  assertCan(actor, 'shifts.manage')
  if (!Number.isInteger(input.openingCash) || input.openingCash < 0) throw invalid('invalid_amount', 'Opening cash must be zero or more')
  try {
    return await withTx(async (tx) => {
      const register = await tx.posRegister.findUnique({ where: { id: input.registerId } })
      if (!register || !register.isActive) throw notFound('Register')
      const shift = await tx.posShift.create({ data: { registerId: register.id, openingCash: input.openingCash, openedById: actor.userId ?? 'system' } })
      await audit(tx, actor, { action: 'shift.open', entityType: 'pos_shift', entityId: shift.id, after: { register: register.name, openingCash: input.openingCash } })
      return shift
    })
  }
  catch (e) {
    if (isUniqueViolation(e)) throw conflict('shift_open', 'This register already has an open shift')
    throw e
  }
}

async function assertShiftAccess(tx: Tx, actor: Actor, shiftId: string) {
  const shift = await tx.posShift.findUnique({ where: { id: shiftId } })
  if (!shift) throw notFound('Shift')
  if (shift.openedById !== actor.userId && !can(actor, 'shifts.view.all')) throw forbidden('This shift belongs to another cashier')
  return shift
}

export async function addCashMovement(actor: Actor, shiftId: string, input: { type: CashMovementType, amount: number, reason: string }) {
  assertCan(actor, 'shifts.manage')
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw invalid('invalid_amount', 'Amount must be greater than zero')
  if (!input.reason.trim()) throw invalid('reason_required', 'A reason is required')
  return withTx(async (tx) => {
    const shift = await assertShiftAccess(tx, actor, shiftId)
    if (shift.status !== 'OPEN') throw conflict('shift_closed', 'The shift is closed')
    const m = await tx.cashMovement.create({ data: { shiftId, type: input.type, amount: input.amount, reason: input.reason.trim(), recordedById: actor.userId ?? 'system' } })
    await audit(tx, actor, { action: `shift.${input.type.toLowerCase()}`, entityType: 'pos_shift', entityId: shiftId, after: input })
    return m
  })
}

export async function closeShift(actor: Actor, shiftId: string, input: { countedCash: number, notes?: string | null }) {
  assertCan(actor, 'shifts.manage')
  if (!Number.isInteger(input.countedCash) || input.countedCash < 0) throw invalid('invalid_amount', 'Counted cash must be zero or more')
  return withTx(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM "PosShift" WHERE "id" = ${shiftId} FOR UPDATE`
    const shift = await assertShiftAccess(tx, actor, shiftId)
    if (shift.status !== 'OPEN') throw conflict('shift_closed', 'The shift is already closed')
    const summary = await shiftSummary(tx, shiftId)
    const difference = input.countedCash - summary.expectedCash
    if (difference !== 0 && !input.notes?.trim()) throw invalid('notes_required', 'Explain the cash difference in the closing notes')
    const closed = await tx.posShift.update({
      where: { id: shiftId },
      data: { status: 'CLOSED', closedAt: new Date(), closedById: actor.userId, expectedCash: summary.expectedCash, countedCash: input.countedCash, difference, closingNotes: input.notes ?? null },
    })
    await audit(tx, actor, { action: 'shift.close', entityType: 'pos_shift', entityId: shiftId, after: { expectedCash: summary.expectedCash, countedCash: input.countedCash, difference } })
    return closed
  })
}

export async function currentShiftFor(actor: Actor, registerId?: string) {
  return prisma.posShift.findFirst({
    where: { status: 'OPEN', ...(registerId ? { registerId } : { openedById: actor.userId ?? '' }) },
    include: { register: true },
    orderBy: { openedAt: 'desc' },
  })
}
