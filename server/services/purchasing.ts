import type { PurchaseOrderStatus } from '@prisma/client'
import type { Actor } from '../lib/actor'
import { assertCan } from '../lib/actor'
import { audit, diff } from '../lib/audit'
import { conflict, invalid, notFound } from '../lib/errors'
import { nextNumber } from '../lib/numbering'
import { withTx } from '../lib/prisma'

export interface SupplierInput {
  name: string
  contactPerson?: string | null
  phone?: string | null
  email?: string | null
  address?: string | null
  notes?: string | null
  isActive?: boolean
}

export async function createSupplier(actor: Actor, input: SupplierInput) {
  assertCan(actor, 'purchasing.manage')
  if (!input.name.trim()) throw invalid('name_required', 'Supplier name is required')
  return withTx(async (tx) => {
    const s = await tx.supplier.create({ data: { ...input, name: input.name.trim() } })
    await audit(tx, actor, { action: 'supplier.create', entityType: 'supplier', entityId: s.id, after: input })
    return s
  })
}

export async function updateSupplier(actor: Actor, id: string, input: Partial<SupplierInput>) {
  assertCan(actor, 'purchasing.manage')
  return withTx(async (tx) => {
    const before = await tx.supplier.findUnique({ where: { id } })
    if (!before) throw notFound('Supplier')
    const s = await tx.supplier.update({ where: { id }, data: input })
    const d = diff(before as unknown as Record<string, unknown>, input)
    if (d) await audit(tx, actor, { action: 'supplier.update', entityType: 'supplier', entityId: id, ...d })
    return s
  })
}

export interface PurchaseOrderInput {
  supplierId: string
  expectedAt?: Date | null
  notes?: string | null
  items: { variantId: string, orderedQty: number, unitCost: number }[]
}

function validatePo(input: PurchaseOrderInput) {
  if (!input.items.length) throw invalid('empty_po', 'Add at least one item')
  const seen = new Set<string>()
  for (const i of input.items) {
    if (!Number.isInteger(i.orderedQty) || i.orderedQty <= 0) throw invalid('invalid_quantity', 'Ordered quantities must be positive whole numbers')
    if (!Number.isInteger(i.unitCost) || i.unitCost < 0) throw invalid('invalid_cost', 'Unit costs must be non-negative')
    if (seen.has(i.variantId)) throw invalid('duplicate_line', 'Each variant may appear once per purchase order')
    seen.add(i.variantId)
  }
}

export async function createPurchaseOrder(actor: Actor, input: PurchaseOrderInput) {
  assertCan(actor, 'purchasing.manage')
  validatePo(input)
  return withTx(async (tx) => {
    const supplier = await tx.supplier.findUnique({ where: { id: input.supplierId } })
    if (!supplier || !supplier.isActive) throw notFound('Active supplier')
    const count = await tx.productVariant.count({ where: { id: { in: input.items.map(i => i.variantId) } } })
    if (count !== input.items.length) throw notFound('One or more variants')
    const number = await nextNumber(tx, 'purchase_order')
    const po = await tx.purchaseOrder.create({
      data: { number, supplierId: input.supplierId, expectedAt: input.expectedAt ?? null, notes: input.notes ?? null, createdById: actor.userId ?? 'system', items: { create: input.items } },
    })
    await audit(tx, actor, { action: 'po.create', entityType: 'purchase_order', entityId: po.id, after: { number, ...input } })
    return po
  })
}

export async function updatePurchaseOrder(actor: Actor, id: string, input: PurchaseOrderInput) {
  assertCan(actor, 'purchasing.manage')
  validatePo(input)
  return withTx(async (tx) => {
    const po = await tx.purchaseOrder.findUnique({ where: { id }, include: { items: true } })
    if (!po) throw notFound('Purchase order')
    if (po.status !== 'DRAFT') throw conflict('po_locked', 'Only draft purchase orders can be edited')
    await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: id } })
    const updated = await tx.purchaseOrder.update({ where: { id }, data: { supplierId: input.supplierId, expectedAt: input.expectedAt ?? null, notes: input.notes ?? null, items: { create: input.items } } })
    await audit(tx, actor, { action: 'po.update', entityType: 'purchase_order', entityId: id, before: { items: po.items }, after: input })
    return updated
  })
}

const PO_TRANSITIONS: Record<PurchaseOrderStatus, PurchaseOrderStatus[]> = {
  DRAFT: ['ORDERED', 'CANCELLED'],
  ORDERED: ['CANCELLED'],
  PARTIALLY_RECEIVED: ['RECEIVED'], // close short: remaining quantities will not arrive
  RECEIVED: [],
  CANCELLED: [],
}

export async function setPurchaseOrderStatus(actor: Actor, id: string, to: PurchaseOrderStatus) {
  assertCan(actor, 'purchasing.manage')
  return withTx(async (tx) => {
    const po = await tx.purchaseOrder.findUnique({ where: { id } })
    if (!po) throw notFound('Purchase order')
    if (!PO_TRANSITIONS[po.status].includes(to)) throw conflict('invalid_transition', `Cannot move a ${po.status.toLowerCase()} purchase order to ${to.toLowerCase()}`)
    const updated = await tx.purchaseOrder.update({ where: { id }, data: { status: to } })
    await audit(tx, actor, { action: `po.${to.toLowerCase()}`, entityType: 'purchase_order', entityId: id, before: { status: po.status }, after: { status: to } })
    return updated
  })
}
