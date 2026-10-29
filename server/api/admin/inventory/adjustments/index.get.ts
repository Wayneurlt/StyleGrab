import { z } from 'zod'
import { prisma } from '~~/server/lib/prisma'
import { pageQuery } from '~~/server/schemas'

export default defineApi(async (event) => {
  await requireStaff(event, 'inventory.view')
  const q = query(event, pageQuery.extend({ status: z.enum(['PENDING_APPROVAL', 'APPLIED', 'REJECTED']).optional() }))
  const { page, pageSize } = pagination(q)
  const where = q.status ? { status: q.status } : {}
  const [total, rows] = await Promise.all([
    prisma.stockAdjustment.count({ where }),
    prisma.stockAdjustment.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize, include: { items: true } }),
  ])
  const variantIds = [...new Set(rows.flatMap(r => r.items.map(i => i.variantId)))]
  const [variants, users] = await Promise.all([
    prisma.productVariant.findMany({ where: { id: { in: variantIds } }, select: { id: true, sku: true, title: true, product: { select: { name: true } } } }),
    prisma.user.findMany({ where: { id: { in: [...new Set(rows.flatMap(r => [r.createdById, r.approvedById]).filter((x): x is string => !!x))] } }, select: { id: true, name: true } }),
  ])
  return {
    total,
    items: rows.map(r => ({
      ...r,
      createdBy: users.find(u => u.id === r.createdById)?.name ?? '—',
      approvedBy: users.find(u => u.id === r.approvedById)?.name ?? null,
      items: r.items.map(i => ({ ...i, variant: variants.find(v => v.id === i.variantId) })),
    })),
  }
})
