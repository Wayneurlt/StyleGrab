import { z } from 'zod'
import { prisma } from '~~/server/lib/prisma'
import { pageQuery } from '~~/server/schemas'

export default defineApi(async (event) => {
  await requireAny(event, ['suppliers.view', 'purchasing.manage', 'inventory.receive'])
  const q = query(event, pageQuery.extend({ status: z.enum(['DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED', 'OPEN']).optional(), supplierId: z.string().max(64).optional() }))
  const { page, pageSize } = pagination(q)
  const where = {
    ...(q.status === 'OPEN' ? { status: { in: ['ORDERED', 'PARTIALLY_RECEIVED'] as ('ORDERED' | 'PARTIALLY_RECEIVED')[] } } : q.status ? { status: q.status } : {}),
    ...(q.supplierId ? { supplierId: q.supplierId } : {}),
    ...(q.q ? { number: { contains: q.q, mode: 'insensitive' as const } } : {}),
  }
  const [total, rows] = await Promise.all([
    prisma.purchaseOrder.count({ where }),
    prisma.purchaseOrder.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize, include: { supplier: { select: { name: true } }, items: true } }),
  ])
  return {
    total,
    items: rows.map(({ items, ...po }) => ({
      ...po,
      lines: items.length,
      orderedUnits: items.reduce((s, i) => s + i.orderedQty, 0),
      receivedUnits: items.reduce((s, i) => s + i.receivedQty, 0),
      value: items.reduce((s, i) => s + i.orderedQty * i.unitCost, 0),
    })),
  }
})
