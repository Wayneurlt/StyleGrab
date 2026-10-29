import { supplierInput } from '~~/server/schemas'
import { createSupplier } from '~~/server/services/purchasing'

export default defineApi(async (event) => {
  const { actor } = await requireStaff(event, 'purchasing.manage')
  return createSupplier(actor, await body(event, supplierInput))
})
