import { prisma } from '~~/server/lib/prisma'

export default defineApi(async (event) => {
  await requireStaff(event, 'inventory.view')
  const st = await prisma.stocktake.findUnique({ where: { id: param(event, 'id') }, include: { items: true } })
  if (!st) throw createError({ statusCode: 404, statusMessage: 'not_found', message: 'Stocktake not found' })
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: st.items.map(i => i.variantId) } },
    select: { id: true, sku: true, barcode: true, title: true, product: { select: { name: true } }, inventory: { select: { onHand: true } } },
  })
  const items = st.items
    .map(i => ({ ...i, variant: variants.find(v => v.id === i.variantId)! }))
    .sort((a, b) => a.variant.product.name.localeCompare(b.variant.product.name) || a.variant.sku.localeCompare(b.variant.sku))
  return { ...st, items }
})
