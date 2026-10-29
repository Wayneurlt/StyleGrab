import { z } from 'zod'
import { searchSellableVariants } from '~~/server/services/catalog'

/** Variant lookup for POS, manual orders, receiving and adjustments (SKU / barcode / name). */
export default defineApi(async (event) => {
  await requireAny(event, ['pos.sell', 'orders.manage', 'inventory.view', 'purchasing.manage'])
  const q = query(event, z.object({ q: z.string().trim().max(100).optional(), categoryId: z.string().max(64).optional(), all: z.enum(['1']).optional() }))
  return searchSellableVariants({ q: q.q, categoryId: q.categoryId, limit: 40, includeDraft: q.all === '1' })
})
