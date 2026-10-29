import { z } from 'zod'
import { updateProductImages } from '~~/server/services/catalog'

export default defineApi(async (event) => {
  const { actor } = await requireStaff(event, 'catalog.manage')
  const input = await body(event, z.object({ order: z.array(z.string().max(64)).max(12), primaryId: z.string().max(64).optional(), alts: z.record(z.string(), z.string().max(150)).optional() }))
  await updateProductImages(actor, param(event, 'id'), input)
  return { ok: true }
})
