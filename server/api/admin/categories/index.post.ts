import { categoryInput } from '~~/server/schemas'
import { createCategory } from '~~/server/services/catalog'

export default defineApi(async (event) => {
  const { actor } = await requireStaff(event, 'catalog.manage')
  return createCategory(actor, await body(event, categoryInput))
})
