import { prisma } from '~~/server/lib/prisma'

export default defineApi(async (event) => {
  await requireAny(event, ['suppliers.view', 'purchasing.manage', 'inventory.receive'])
  const po = await prisma.purchaseOrder.findUnique({
    where: { id: param(event, 'id') },
    include: { supplier: true, items: true, receipts: { orderBy: { receivedAt: 'asc' }, include: { items: true } } },
  })
  if (!po) throw createError({ statusCode: 404, statusMessage: 'not_found', message: 'Purchase order not found' })
  const variants = await prisma.productVariant.findMany({ where: { id: { in: po.items.map(i => i.variantId) } }, select: { id: true, sku: true, title: true, product: { select: { name: true } } } })
  return { ...po, items: po.items.map(i => ({ ...i, variant: variants.find(v => v.id === i.variantId) })) }
})
