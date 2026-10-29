import { z } from 'zod'
import { setLowStockThreshold } from '~~/server/services/inventory'

export default defineApi(async (event) => {
  const { actor } = await requireStaff(event, 'inventory.adjust')
  const { threshold } = await body(event, z.object({ threshold: z.number().int().min(0).max(100000) }))
  await setLowStockThreshold(actor, param(event, 'variantId'), threshold)
  return { ok: true }
})
