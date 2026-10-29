import { supplierInput } from '~~/server/schemas'
import { updateSupplier } from '~~/server/services/purchasing'

export default defineApi(async (event) => {
  const { actor } = await requireStaff(event, 'purchasing.manage')
  return updateSupplier(actor, param(event, 'id'), await body(event, supplierInput.partial()))
})
