import type { AdjustmentReason, MovementType, Prisma } from '@prisma/client'
import type { Actor } from '../lib/actor'
import { assertCan, can } from '../lib/actor'
import { audit } from '../lib/audit'
import { conflict, DomainError, invalid, notFound } from '../lib/errors'
import { nextNumber } from '../lib/numbering'
import { prisma, withTx, type Tx } from '../lib/prisma'
import { getSettings } from '../lib/settings'

/**
 * ---------------------------------------------------------------------------
 * THE single authoritative stock operation.
 * ---------------------------------------------------------------------------
 * Every change to on-hand or reserved stock (sales, reservations, receipts, returns, adjustments, counts)
 * must go through `applyMovement`. It:
 *   1. claims the movement's `dedupeKey` (unique) — a retried or concurrent duplicate fails/returns early,
 *   2. updates the balance with a single conditional UPDATE, so concurrent transactions can never take
 *      the same available unit twice (the row lock serialises them; the WHERE re-checks after the lock),
 *   3. blends the weighted-average cost when stock enters with a known unit cost,
 *   4. appends the ledger row with the resulting balances.
 * DB CHECK constraints (onHand >= 0, 0 <= reserved <= onHand) are the last line of defence.
 */
export interface MovementInput {
  variantId: string
  type: MovementType
  qtyOnHand?: number
  qtyReserved?: number
  /** Unit cost of stock entering (receipts, returns, positive adjustments). Blends into the average cost. */
  costIn?: number | null
  reason?: string | null
  notes?: string | null
  referenceType?: string | null
  referenceId?: string | null
  referenceLabel?: string | null
  dedupeKey?: string | null
  userId?: string | null
}

export interface MovementResult {
  duplicate: boolean
  onHand: number
  reserved: number
  /** Average cost *before* this movement (used as the cost snapshot for outgoing stock). */
  avgCostBefore: number | null
}

export class InsufficientStockError extends DomainError {
  constructor(public readonly variantId: string, available: number, requested: number, label?: string) {
    super('insufficient_stock', `Not enough stock${label ? ` for ${label}` : ''}: ${available} available, ${requested} requested`, 409, { variantId, available, requested })
  }
}

export async function applyMovement(tx: Tx, input: MovementInput): Promise<MovementResult> {
  const dOn = input.qtyOnHand ?? 0
  const dRes = input.qtyReserved ?? 0
  if (!Number.isInteger(dOn) || !Number.isInteger(dRes)) throw invalid('invalid_quantity', 'Quantities must be whole numbers')
  if (dOn === 0 && dRes === 0) throw invalid('empty_movement', 'A stock movement must change on-hand or reserved quantity')

  if (input.dedupeKey) {
    const existing = await tx.inventoryMovement.findUnique({ where: { dedupeKey: input.dedupeKey } })
    if (existing) return { duplicate: true, onHand: existing.onHandAfter, reserved: existing.reservedAfter, avgCostBefore: existing.unitCost }
  }

  const before = await tx.$queryRaw<{ avgCost: number | null }[]>`
    SELECT "avgCost" FROM "InventoryBalance" WHERE "variantId" = ${input.variantId} FOR UPDATE`
  if (!before.length) throw notFound('Inventory record for variant')
  const avgCostBefore = before[0]!.avgCost

  const costIn = dOn > 0 && input.costIn != null ? input.costIn : null
  const rows = await tx.$queryRaw<{ onHand: number, reserved: number }[]>`
    UPDATE "InventoryBalance"
    SET "onHand" = "onHand" + ${dOn},
        "reserved" = "reserved" + ${dRes},
        "avgCost" = CASE
          WHEN ${costIn}::int IS NULL THEN "avgCost"
          WHEN "avgCost" IS NULL OR "onHand" <= 0 THEN ${costIn}::int
          ELSE ROUND(("avgCost"::numeric * "onHand" + ${costIn}::numeric * ${dOn}) / ("onHand" + ${dOn}))::int
        END,
        "updatedAt" = now()
    WHERE "variantId" = ${input.variantId}
      AND "onHand" + ${dOn} >= 0
      AND "reserved" + ${dRes} >= 0
      AND "reserved" + ${dRes} <= "onHand" + ${dOn}
    RETURNING "onHand", "reserved"`

  if (!rows.length) {
    const bal = await tx.inventoryBalance.findUniqueOrThrow({ where: { variantId: input.variantId }, include: { variant: { select: { sku: true } } } })
    const available = bal.onHand - bal.reserved
    const requested = dRes > 0 ? dRes : -dOn
    if (dRes < 0 && bal.reserved + dRes < 0) throw conflict('reservation_missing', `Reservation for ${bal.variant.sku} has already been released`)
    throw new InsufficientStockError(input.variantId, Math.max(available, 0), requested, bal.variant.sku)
  }

  const { onHand, reserved } = rows[0]!
  // Outgoing / internal movements are valued at the average cost; incoming at their own cost.
  const unitCost = costIn ?? avgCostBefore
  await tx.inventoryMovement.create({
    data: {
      variantId: input.variantId,
      type: input.type,
      qtyOnHand: dOn,
      qtyReserved: dRes,
      onHandAfter: onHand,
      reservedAfter: reserved,
      unitCost,
      reason: input.reason ?? null,
      notes: input.notes ?? null,
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
      referenceLabel: input.referenceLabel ?? null,
      dedupeKey: input.dedupeKey ?? null,
      userId: input.userId ?? null,
    },
  })
  return { duplicate: false, onHand, reserved, avgCostBefore }
}

/** Ensure an inventory balance row exists for each variant (created with the variant; this is defensive). */
export async function ensureBalances(tx: Tx, variantIds: string[], threshold?: number): Promise<void> {
  if (!variantIds.length) return
  const lowStockThreshold = threshold ?? (await getSettings(tx)).defaultLowStockThreshold
  await tx.inventoryBalance.createMany({ data: variantIds.map(variantId => ({ variantId, lowStockThreshold })), skipDuplicates: true })
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export type StockFilter = 'all' | 'low' | 'out' | 'in'

export async function listStock(params: { q?: string, categoryId?: string, filter?: StockFilter, page: number, pageSize: number }) {
  const where: Prisma.ProductVariantWhereInput = { isArchived: false, product: { status: { not: 'ARCHIVED' } } }
  if (params.q) {
    const q = params.q.trim()
    where.OR = [
      { sku: { contains: q, mode: 'insensitive' } },
      { barcode: { equals: q } },
      { title: { contains: q, mode: 'insensitive' } },
      { product: { name: { contains: q, mode: 'insensitive' } } },
    ]
  }
  if (params.categoryId) where.product = { ...(where.product as object), categoryId: params.categoryId }

  if (params.filter && params.filter !== 'all') {
    // Column-to-column comparison is not expressible in Prisma filters; resolve ids with SQL.
    const ids = await prisma.$queryRawUnsafe<{ variantId: string }[]>(
      params.filter === 'out'
        ? `SELECT "variantId" FROM "InventoryBalance" WHERE "onHand" - "reserved" <= 0`
        : params.filter === 'low'
          ? `SELECT "variantId" FROM "InventoryBalance" WHERE "onHand" - "reserved" > 0 AND "onHand" - "reserved" <= "lowStockThreshold"`
          : `SELECT "variantId" FROM "InventoryBalance" WHERE "onHand" - "reserved" > 0`,
    )
    where.id = { in: ids.map(r => r.variantId) }
  }

  const [total, rows] = await Promise.all([
    prisma.productVariant.count({ where }),
    prisma.productVariant.findMany({
      where,
      include: {
        inventory: true,
        product: { select: { id: true, name: true, code: true, category: { select: { name: true } }, images: { where: { isPrimary: true }, take: 1, select: { key: true } } } },
      },
      orderBy: [{ product: { name: 'asc' } }, { sortOrder: 'asc' }],
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
  ])
  return {
    total,
    items: rows.map(v => ({
      variantId: v.id,
      sku: v.sku,
      barcode: v.barcode,
      title: v.title,
      productId: v.product.id,
      productName: v.product.name,
      category: v.product.category.name,
      imageKey: v.product.images[0]?.key ?? null,
      onHand: v.inventory?.onHand ?? 0,
      reserved: v.inventory?.reserved ?? 0,
      available: (v.inventory?.onHand ?? 0) - (v.inventory?.reserved ?? 0),
      lowStockThreshold: v.inventory?.lowStockThreshold ?? 0,
      avgCost: v.inventory?.avgCost ?? null,
    })),
  }
}

export async function setLowStockThreshold(actor: Actor, variantId: string, threshold: number) {
  assertCan(actor, 'inventory.adjust')
  if (!Number.isInteger(threshold) || threshold < 0) throw invalid('invalid_threshold', 'Threshold must be a non-negative whole number')
  return withTx(async (tx) => {
    const before = await tx.inventoryBalance.findUnique({ where: { variantId } })
    if (!before) throw notFound('Variant')
    await tx.inventoryBalance.update({ where: { variantId }, data: { lowStockThreshold: threshold } })
    await audit(tx, actor, { action: 'inventory.threshold', entityType: 'variant', entityId: variantId, before: { lowStockThreshold: before.lowStockThreshold }, after: { lowStockThreshold: threshold } })
  })
}

// ---------------------------------------------------------------------------
// Stock adjustments
// ---------------------------------------------------------------------------

const REASON_TO_MOVEMENT: Record<AdjustmentReason, MovementType> = {
  OPENING_STOCK: 'OPENING_STOCK',
  COUNT_DISCREPANCY: 'COUNT_ADJUSTMENT',
  DAMAGE: 'DAMAGE',
  LOSS: 'LOSS',
  DATA_CORRECTION: 'ADJUSTMENT',
  OTHER: 'ADJUSTMENT',
}

export interface AdjustmentInput {
  reason: AdjustmentReason
  notes?: string | null
  items: { variantId: string, qtyChange: number, unitCost?: number | null }[]
}

function validateAdjustment(input: AdjustmentInput) {
  if (!input.items.length) throw invalid('empty_adjustment', 'Add at least one item')
  const seen = new Set<string>()
  for (const item of input.items) {
    if (!Number.isInteger(item.qtyChange) || item.qtyChange === 0) throw invalid('invalid_quantity', 'Each line must change stock by a non-zero whole number')
    if (seen.has(item.variantId)) throw invalid('duplicate_line', 'Each variant may appear only once per adjustment')
    seen.add(item.variantId)
    if ((input.reason === 'DAMAGE' || input.reason === 'LOSS') && item.qtyChange > 0) throw invalid('invalid_direction', 'Damage and loss adjustments must reduce stock')
    if (input.reason === 'OPENING_STOCK' && item.qtyChange < 0) throw invalid('invalid_direction', 'Opening stock must be positive')
  }
  if (input.reason !== 'OPENING_STOCK' && !input.notes?.trim()) throw invalid('reason_required', 'Explain the reason for this adjustment')
}

async function postAdjustment(tx: Tx, adjustmentId: string, number: string, input: AdjustmentInput, userId: string | null) {
  for (const item of input.items) {
    await applyMovement(tx, {
      variantId: item.variantId,
      type: REASON_TO_MOVEMENT[input.reason],
      qtyOnHand: item.qtyChange,
      costIn: item.qtyChange > 0 ? item.unitCost ?? null : null,
      reason: input.reason,
      notes: input.notes,
      referenceType: 'adjustment',
      referenceId: adjustmentId,
      referenceLabel: number,
      dedupeKey: `ADJ:${adjustmentId}:${item.variantId}`,
      userId,
    })
  }
}

/** Creates an adjustment. Applied immediately when within the threshold or when the actor may approve. */
export async function createAdjustment(actor: Actor, input: AdjustmentInput, existingTx?: Tx) {
  assertCan(actor, 'inventory.adjust')
  validateAdjustment(input)
  const run = async (tx: Tx) => {
    const settings = await getSettings(tx)
    const totalAbs = input.items.reduce((s, i) => s + Math.abs(i.qtyChange), 0)
    const autoApply = can(actor, 'inventory.adjust.approve') || totalAbs <= settings.adjustmentApprovalThreshold
    const variants = await tx.productVariant.count({ where: { id: { in: input.items.map(i => i.variantId) } } })
    if (variants !== input.items.length) throw notFound('One or more variants')

    const number = await nextNumber(tx, 'adjustment')
    const adj = await tx.stockAdjustment.create({
      data: {
        number,
        reason: input.reason,
        notes: input.notes ?? null,
        status: autoApply ? 'APPLIED' : 'PENDING_APPROVAL',
        createdById: actor.userId ?? 'system',
        approvedById: autoApply ? actor.userId : null,
        decidedAt: autoApply ? new Date() : null,
        items: { create: input.items.map(i => ({ variantId: i.variantId, qtyChange: i.qtyChange, unitCost: i.unitCost ?? null })) },
      },
    })
    if (autoApply) await postAdjustment(tx, adj.id, number, input, actor.userId)
    await audit(tx, actor, { action: autoApply ? 'inventory.adjust' : 'inventory.adjust.request', entityType: 'stock_adjustment', entityId: adj.id, after: { number, ...input }, reason: input.notes })
    return adj
  }
  return existingTx ? run(existingTx) : withTx(run)
}

export async function decideAdjustment(actor: Actor, adjustmentId: string, approve: boolean, note?: string) {
  assertCan(actor, 'inventory.adjust.approve')
  return withTx(async (tx) => {
    // Lock the adjustment row so it can only be decided once.
    const locked = await tx.$queryRaw<{ status: string }[]>`SELECT "status" FROM "StockAdjustment" WHERE "id" = ${adjustmentId} FOR UPDATE`
    if (!locked.length) throw notFound('Adjustment')
    if (locked[0]!.status !== 'PENDING_APPROVAL') throw conflict('already_decided', 'This adjustment has already been decided')
    const adj = await tx.stockAdjustment.findUniqueOrThrow({ where: { id: adjustmentId }, include: { items: true } })
    if (approve) {
      await postAdjustment(tx, adj.id, adj.number, { reason: adj.reason, notes: adj.notes, items: adj.items }, actor.userId)
    }
    const updated = await tx.stockAdjustment.update({
      where: { id: adjustmentId },
      data: { status: approve ? 'APPLIED' : 'REJECTED', approvedById: actor.userId, decidedAt: new Date(), decisionNote: note ?? null },
    })
    await audit(tx, actor, { action: approve ? 'inventory.adjust.approve' : 'inventory.adjust.reject', entityType: 'stock_adjustment', entityId: adj.id, reason: note })
    return updated
  })
}

// ---------------------------------------------------------------------------
// Goods receiving
// ---------------------------------------------------------------------------

export interface ReceiptInput {
  purchaseOrderId?: string | null
  supplierId?: string | null
  reference?: string | null
  receivedAt?: Date
  notes?: string | null
  idempotencyKey: string
  items: { variantId: string, receivedQty: number, acceptedQty: number, damagedQty?: number, unitCost: number, notes?: string | null }[]
}

/** Records a delivery. Only accepted quantities enter sellable stock, at their purchase cost. Idempotent by key. */
export async function receiveGoods(actor: Actor, input: ReceiptInput) {
  assertCan(actor, 'inventory.receive')
  if (!input.items.length) throw invalid('empty_receipt', 'Add at least one received item')
  for (const i of input.items) {
    const damaged = i.damagedQty ?? 0
    if ([i.receivedQty, i.acceptedQty, damaged, i.unitCost].some(n => !Number.isInteger(n) || n < 0)) throw invalid('invalid_quantity', 'Quantities and costs must be non-negative whole numbers')
    if (i.acceptedQty + damaged > i.receivedQty) throw invalid('invalid_quantity', 'Accepted plus damaged cannot exceed the quantity received')
  }
  if (!input.items.some(i => i.receivedQty > 0)) throw invalid('empty_receipt', 'Nothing was received')

  return withTx(async (tx) => {
    const existing = await tx.goodsReceipt.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: { items: true } })
    if (existing) return existing

    let supplierId = input.supplierId ?? null
    let po: { id: string, number: string, status: string, items: { id: string, variantId: string, orderedQty: number, receivedQty: number }[] } | null = null
    if (input.purchaseOrderId) {
      await tx.$queryRaw`SELECT 1 FROM "PurchaseOrder" WHERE "id" = ${input.purchaseOrderId} FOR UPDATE`
      po = await tx.purchaseOrder.findUnique({ where: { id: input.purchaseOrderId }, include: { items: true } })
      if (!po) throw notFound('Purchase order')
      if (!['ORDERED', 'PARTIALLY_RECEIVED'].includes(po.status)) throw conflict('po_not_receivable', `Purchase order ${po.number} is not open for receiving`)
      supplierId = (await tx.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } })).supplierId
      for (const i of input.items) {
        if (!po.items.some(p => p.variantId === i.variantId)) throw invalid('not_on_po', 'Every received item must be on the purchase order')
      }
    }

    const number = await nextNumber(tx, 'goods_receipt')
    const receipt = await tx.goodsReceipt.create({
      data: {
        number,
        supplierId,
        purchaseOrderId: po?.id ?? null,
        reference: input.reference ?? null,
        receivedAt: input.receivedAt ?? new Date(),
        notes: input.notes ?? null,
        receivedById: actor.userId ?? 'system',
        idempotencyKey: input.idempotencyKey,
        items: { create: input.items.map(i => ({ variantId: i.variantId, receivedQty: i.receivedQty, acceptedQty: i.acceptedQty, damagedQty: i.damagedQty ?? 0, unitCost: i.unitCost, notes: i.notes ?? null })) },
      },
      include: { items: true },
    })

    await ensureBalances(tx, receipt.items.map(i => i.variantId))
    for (const item of receipt.items) {
      if (item.acceptedQty > 0) {
        await applyMovement(tx, {
          variantId: item.variantId,
          type: 'PURCHASE_RECEIPT',
          qtyOnHand: item.acceptedQty,
          costIn: item.unitCost,
          referenceType: 'goods_receipt',
          referenceId: receipt.id,
          referenceLabel: number,
          notes: item.damagedQty ? `${item.damagedQty} damaged on arrival` : item.notes,
          dedupeKey: `GRN:${item.id}`,
          userId: actor.userId,
        })
      }
    }

    if (po) {
      for (const item of input.items) {
        const poItem = po.items.find(p => p.variantId === item.variantId)!
        await tx.purchaseOrderItem.update({ where: { id: poItem.id }, data: { receivedQty: { increment: item.receivedQty } } })
      }
      const items = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId: po.id } })
      const complete = items.every(i => i.receivedQty >= i.orderedQty)
      await tx.purchaseOrder.update({ where: { id: po.id }, data: { status: complete ? 'RECEIVED' : 'PARTIALLY_RECEIVED' } })
    }

    await audit(tx, actor, { action: 'inventory.receive', entityType: 'goods_receipt', entityId: receipt.id, after: { number, purchaseOrder: po?.number, items: input.items } })
    return receipt
  })
}

// ---------------------------------------------------------------------------
// Stocktakes
// ---------------------------------------------------------------------------

async function categorySubtree(tx: Tx, rootId: string): Promise<string[]> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    WITH RECURSIVE tree AS (
      SELECT "id" FROM "Category" WHERE "id" = ${rootId}
      UNION ALL SELECT c."id" FROM "Category" c JOIN tree t ON c."parentId" = t."id"
    ) SELECT "id" FROM tree`
  return rows.map(r => r.id)
}

export async function startStocktake(actor: Actor, input: { name: string, categoryId?: string | null, notes?: string | null }) {
  assertCan(actor, 'inventory.stocktake')
  return withTx(async (tx) => {
    const categoryIds = input.categoryId ? await categorySubtree(tx, input.categoryId) : null
    const variants = await tx.productVariant.findMany({
      where: { isArchived: false, product: { status: { not: 'ARCHIVED' }, ...(categoryIds ? { categoryId: { in: categoryIds } } : {}) } },
      select: { id: true, inventory: { select: { onHand: true } } },
    })
    if (!variants.length) throw invalid('nothing_to_count', 'There are no active variants in this scope')
    const number = await nextNumber(tx, 'stocktake')
    const st = await tx.stocktake.create({
      data: {
        number,
        name: input.name,
        notes: input.notes ?? null,
        categoryId: input.categoryId ?? null,
        startedById: actor.userId ?? 'system',
        items: { create: variants.map(v => ({ variantId: v.id, expectedQty: v.inventory?.onHand ?? 0 })) },
      },
    })
    await audit(tx, actor, { action: 'stocktake.start', entityType: 'stocktake', entityId: st.id, after: { number, name: input.name, items: variants.length } })
    return st
  }, { timeout: 60_000 })
}

export async function recordCounts(actor: Actor, stocktakeId: string, counts: { variantId: string, countedQty: number | null }[]) {
  assertCan(actor, 'inventory.stocktake')
  return withTx(async (tx) => {
    const st = await tx.stocktake.findUnique({ where: { id: stocktakeId } })
    if (!st) throw notFound('Stocktake')
    if (st.status !== 'IN_PROGRESS') throw conflict('stocktake_locked', 'Counts can only be recorded while the stocktake is in progress')
    for (const c of counts) {
      if (c.countedQty != null && (!Number.isInteger(c.countedQty) || c.countedQty < 0)) throw invalid('invalid_quantity', 'Counts must be non-negative whole numbers')
      const res = await tx.stocktakeItem.updateMany({
        where: { stocktakeId, variantId: c.variantId },
        data: { countedQty: c.countedQty, countedAt: c.countedQty == null ? null : new Date(), countedById: actor.userId },
      })
      if (!res.count) throw notFound('Stocktake line')
    }
  })
}

export async function submitStocktake(actor: Actor, stocktakeId: string) {
  assertCan(actor, 'inventory.stocktake')
  return withTx(async (tx) => {
    const st = await tx.stocktake.findUnique({ where: { id: stocktakeId }, include: { items: { select: { countedQty: true } } } })
    if (!st) throw notFound('Stocktake')
    if (st.status !== 'IN_PROGRESS') throw conflict('invalid_state', 'Only an in-progress stocktake can be submitted')
    if (!st.items.some(i => i.countedQty != null)) throw invalid('no_counts', 'Record at least one count before submitting')
    await tx.stocktake.update({ where: { id: stocktakeId }, data: { status: 'SUBMITTED', submittedAt: new Date(), submittedById: actor.userId } })
    await audit(tx, actor, { action: 'stocktake.submit', entityType: 'stocktake', entityId: stocktakeId })
  })
}

/**
 * Posts COUNT_ADJUSTMENT movements of (counted - expected) for counted lines. Using the delta against the
 * snapshot taken at start means sales recorded during the count are not overwritten. Uncounted lines are ignored.
 */
export async function finalizeStocktake(actor: Actor, stocktakeId: string) {
  assertCan(actor, 'inventory.stocktake.finalize')
  return withTx(async (tx) => {
    const locked = await tx.$queryRaw<{ status: string }[]>`SELECT "status" FROM "Stocktake" WHERE "id" = ${stocktakeId} FOR UPDATE`
    if (!locked.length) throw notFound('Stocktake')
    if (locked[0]!.status !== 'SUBMITTED') throw conflict('invalid_state', 'Only a submitted stocktake can be finalized')
    const st = await tx.stocktake.findUniqueOrThrow({ where: { id: stocktakeId }, include: { items: true } })
    let adjusted = 0
    for (const item of st.items) {
      if (item.countedQty == null) continue
      const delta = item.countedQty - item.expectedQty
      if (delta === 0) continue
      await applyMovement(tx, {
        variantId: item.variantId,
        type: 'COUNT_ADJUSTMENT',
        qtyOnHand: delta,
        reason: 'COUNT_DISCREPANCY',
        notes: `Stocktake ${st.number}: expected ${item.expectedQty}, counted ${item.countedQty}`,
        referenceType: 'stocktake',
        referenceId: st.id,
        referenceLabel: st.number,
        dedupeKey: `STK:${item.id}`,
        userId: actor.userId,
      })
      adjusted++
    }
    await tx.stocktake.update({ where: { id: stocktakeId }, data: { status: 'FINALIZED', finalizedAt: new Date(), finalizedById: actor.userId } })
    await audit(tx, actor, { action: 'stocktake.finalize', entityType: 'stocktake', entityId: stocktakeId, after: { adjustedLines: adjusted } })
    return { adjustedLines: adjusted }
  }, { timeout: 120_000 })
}

export async function cancelStocktake(actor: Actor, stocktakeId: string) {
  assertCan(actor, 'inventory.stocktake')
  return withTx(async (tx) => {
    const st = await tx.stocktake.findUnique({ where: { id: stocktakeId } })
    if (!st) throw notFound('Stocktake')
    if (st.status === 'FINALIZED' || st.status === 'CANCELLED') throw conflict('invalid_state', 'This stocktake is already closed')
    await tx.stocktake.update({ where: { id: stocktakeId }, data: { status: 'CANCELLED' } })
    await audit(tx, actor, { action: 'stocktake.cancel', entityType: 'stocktake', entityId: stocktakeId })
  })
}
