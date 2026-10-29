import { z } from 'zod'
import { startStocktake } from '~~/server/services/inventory'

export default defineApi(async (event) => {
  const { actor } = await requireStaff(event, 'inventory.stocktake')
  const input = await body(event, z.object({ name: z.string().trim().min(1).max(120), categoryId: z.string().max(64).nullish(), notes: z.string().trim().max(1000).nullish() }))
  return startStocktake(actor, input)
})
