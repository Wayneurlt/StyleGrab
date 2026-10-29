import { z } from 'zod'
import { reorderCategories } from '~~/server/services/catalog'

export default defineApi(async (event) => {
  const { actor } = await requireStaff(event, 'catalog.manage')
  const input = await body(event, z.object({ ids: z.array(z.string().max(64)).max(500) }))
  await reorderCategories(actor, input.ids)
  return { ok: true }
})
