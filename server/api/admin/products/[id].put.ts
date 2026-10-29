import { productInput } from '~~/server/schemas'
import { updateProduct } from '~~/server/services/catalog'

export default defineApi(async (event) => {
  const { actor } = await requireStaff(event, 'catalog.manage')
  return updateProduct(actor, param(event, 'id'), await body(event, productInput))
})
