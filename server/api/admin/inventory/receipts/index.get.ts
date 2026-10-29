import { prisma } from '~~/server/lib/prisma'
import { pageQuery } from '~~/server/schemas'

export default defineApi(async (event) => {
  await requireAny(event, ['inventory.receive', 'suppliers.view', 'inventory.view'])
  const q = query(event, pageQuery)
  const { page, pageSize } = pagination(q)
  const where = q.q ? { OR: [{ number: { contains: q.q, mode: 'insensitive' as const } }, { reference: { contains: q.q, mode: 'insensitive' as const } }] } : {}
  const [total, items] = await Promise.all([
    prisma.goodsReceipt.count({ where }),
    prisma.goodsReceipt.findMany({
      where, orderBy: { receivedAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize,
      include: { supplier: { select: { name: true } }, purchaseOrder: { select: { number: true } }, items: { select: { receivedQty: true, acceptedQty: true, damagedQty: true, unitCost: true } } },
    }),
  ])
  return {
    total,
    items: items.map(r => ({
      ...r,
      units: r.items.reduce((s, i) => s + i.acceptedQty, 0),
      damaged: r.items.reduce((s, i) => s + i.damagedQty, 0),
      value: r.items.reduce((s, i) => s + i.acceptedQty * i.unitCost, 0),
    })),
  }
})
