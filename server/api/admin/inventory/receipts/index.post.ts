import { receiptInput } from '~~/server/schemas'
import { receiveGoods } from '~~/server/services/inventory'

export default defineApi(async (event) => {
  const { actor } = await requireStaff(event, 'inventory.receive')
  return receiveGoods(actor, await body(event, receiptInput))
})
