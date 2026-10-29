import { purchaseOrderInput } from '~~/server/schemas'
import { createPurchaseOrder } from '~~/server/services/purchasing'

export default defineApi(async (event) => {
  const { actor } = await requireStaff(event, 'purchasing.manage')
  return createPurchaseOrder(actor, await body(event, purchaseOrderInput))
})
