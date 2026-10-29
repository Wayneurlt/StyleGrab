import { purchaseOrderInput } from '~~/server/schemas'
import { updatePurchaseOrder } from '~~/server/services/purchasing'

export default defineApi(async (event) => {
  const { actor } = await requireStaff(event, 'purchasing.manage')
  return updatePurchaseOrder(actor, param(event, 'id'), await body(event, purchaseOrderInput))
})
