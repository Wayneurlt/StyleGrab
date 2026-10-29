import { productInput } from '~~/server/schemas'
import { createProduct } from '~~/server/services/catalog'

export default defineApi(async (event) => {
  const { actor } = await requireStaff(event, 'catalog.manage')
  const input = await body(event, productInput)
  if (input.costPrice != null || input.variants.some(v => v.price != null || v.costPrice != null)) await requireStaff(event, 'catalog.price')
  return createProduct(actor, input)
})
