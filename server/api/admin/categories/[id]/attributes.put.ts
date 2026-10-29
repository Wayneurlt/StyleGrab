import { z } from 'zod'
import { attributeInput } from '~~/server/schemas'
import { setCategoryAttributes } from '~~/server/services/catalog'

export default defineApi(async (event) => {
  const { actor } = await requireStaff(event, 'catalog.manage')
  const input = await body(event, z.object({ attributes: z.array(attributeInput).max(20) }))
  await setCategoryAttributes(actor, param(event, 'id'), input.attributes)
  return { ok: true }
})
