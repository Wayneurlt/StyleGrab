import { prisma } from '~~/server/lib/prisma'
import { pageQuery } from '~~/server/schemas'

export default defineApi(async (event) => {
  await requireStaff(event, 'orders.view')
  const q = query(event, pageQuery)
  const { page, pageSize } = pagination(q)
  const where = q.q ? { OR: [{ number: { contains: q.q, mode: 'insensitive' as const } }, { order: { number: { contains: q.q, mode: 'insensitive' as const } } }] } : {}
  const [total, items] = await Promise.all([
    prisma.return.count({ where }),
    prisma.return.findMany({
      where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize,
      include: {
        order: { select: { id: true, number: true } },
        items: { include: { orderItem: { select: { productName: true, variantTitle: true, sku: true } } } },
        refunds: { include: { method: { select: { name: true } } } },
      },
    }),
  ])
  return { total, items }
})
