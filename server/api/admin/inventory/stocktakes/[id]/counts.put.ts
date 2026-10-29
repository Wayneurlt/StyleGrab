import { z } from 'zod'
import { recordCounts } from '~~/server/services/inventory'

export default defineApi(async (event) => {
  const { actor } = await requireStaff(event, 'inventory.stocktake')
  const input = await body(event, z.object({ counts: z.array(z.object({ variantId: z.string().max(64), countedQty: z.number().int().min(0).max(1_000_000).nullable() })).min(1).max(500) }))
  await recordCounts(actor, param(event, 'id'), input.counts)
  return { ok: true }
})
