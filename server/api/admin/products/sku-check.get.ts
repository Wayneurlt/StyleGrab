import { z } from 'zod'
import { isSkuAvailable } from '~~/server/services/catalog'

export default defineApi(async (event) => {
  await requireStaff(event, 'catalog.view')
  const q = query(event, z.object({ sku: z.string().trim().min(1).max(60), exclude: z.string().max(64).optional() }))
  return { available: await isSkuAvailable(q.sku, q.exclude) }
})
