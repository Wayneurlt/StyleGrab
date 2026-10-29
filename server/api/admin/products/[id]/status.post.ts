import { z } from 'zod'
import { setProductStatus } from '~~/server/services/catalog'

export default defineApi(async (event) => {
  const { actor } = await requireStaff(event, 'catalog.manage')
  const { status } = await body(event, z.object({ status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']) }))
  await setProductStatus(actor, param(event, 'id'), status)
  return { ok: true }
})
