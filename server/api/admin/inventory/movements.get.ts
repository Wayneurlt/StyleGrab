import type { MovementType, Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '~~/server/lib/prisma'
import { pageQuery, rangeQuery } from '~~/server/schemas'
import { resolveRange } from '~~/server/services/reports'

const TYPES = ['OPENING_STOCK', 'PURCHASE_RECEIPT', 'SALE', 'RETURN_TO_STOCK', 'DAMAGE', 'LOSS', 'ADJUSTMENT', 'COUNT_ADJUSTMENT', 'RESERVATION', 'RESERVATION_RELEASE'] as const

export default defineApi(async (event) => {
  await requireStaff(event, 'inventory.view')
  const q = query(event, pageQuery.merge(rangeQuery).extend({ type: z.enum(TYPES).optional(), variantId: z.string().max(64).optional() }))
  const { page, pageSize } = pagination(q)
  const where: Prisma.InventoryMovementWhereInput = {}
  if (q.type) where.type = q.type as MovementType
  if (q.variantId) where.variantId = q.variantId
  if (q.from || q.to) {
    const r = await resolveRange({ from: q.from ?? '2000-01-01', to: q.to })
    where.createdAt = { gte: r.start, lt: r.end }
  }
  if (q.q) where.OR = [{ variant: { sku: { contains: q.q, mode: 'insensitive' } } }, { variant: { product: { name: { contains: q.q, mode: 'insensitive' } } } }, { referenceLabel: { contains: q.q, mode: 'insensitive' } }]
  const [total, items] = await Promise.all([
    prisma.inventoryMovement.count({ where }),
    prisma.inventoryMovement.findMany({
      where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize,
      include: { variant: { select: { sku: true, title: true, product: { select: { name: true } } } } },
    }),
  ])
  const users = await prisma.user.findMany({ where: { id: { in: [...new Set(items.map(i => i.userId).filter((x): x is string => !!x))] } }, select: { id: true, name: true } })
  return { total, items: items.map(i => ({ ...i, userName: users.find(u => u.id === i.userId)?.name ?? null })) }
})
