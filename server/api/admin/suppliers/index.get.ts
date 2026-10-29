import { prisma } from '~~/server/lib/prisma'
import { pageQuery } from '~~/server/schemas'

export default defineApi(async (event) => {
  await requireAny(event, ['suppliers.view', 'purchasing.manage', 'inventory.receive'])
  const q = query(event, pageQuery)
  const { page, pageSize } = pagination(q)
  const where = q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' as const } }, { contactPerson: { contains: q.q, mode: 'insensitive' as const } }] } : {}
  const [total, items] = await Promise.all([
    prisma.supplier.count({ where }),
    prisma.supplier.findMany({ where, orderBy: [{ isActive: 'desc' }, { name: 'asc' }], skip: (page - 1) * pageSize, take: pageSize, include: { _count: { select: { purchaseOrders: true, receipts: true } } } }),
  ])
  return { total, items }
})
