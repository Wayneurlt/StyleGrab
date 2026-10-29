import { prisma } from '~~/server/lib/prisma'

export default defineApi(async (event) => {
  await requireStaff(event, 'inventory.view')
  const rows = await prisma.stocktake.findMany({ orderBy: { startedAt: 'desc' }, take: 100, include: { items: { select: { countedQty: true, expectedQty: true } } } })
  return rows.map(({ items, ...s }) => ({
    ...s,
    lines: items.length,
    counted: items.filter(i => i.countedQty != null).length,
    discrepancies: items.filter(i => i.countedQty != null && i.countedQty !== i.expectedQty).length,
  }))
})
