import { z } from 'zod'
import { categoryInput } from '~~/server/schemas'
import { updateCategory } from '~~/server/services/catalog'

export default defineApi(async (event) => {
  const { actor } = await requireStaff(event, 'catalog.manage')
  return updateCategory(actor, param(event, 'id'), await body(event, categoryInput.partial().extend({ isArchived: z.boolean().optional() })))
})
