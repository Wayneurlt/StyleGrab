import { posSaleInput } from '~~/server/schemas'
import { createOrder } from '~~/server/services/orders'

/** Records a POS sale: server-side pricing, single stock deduction, payments recorded in the same transaction. */
export default defineApi(async (event) => {
  const { actor } = await requireStaff(event, 'pos.sell')
  const input = await body(event, posSaleInput)
  return createOrder(actor, { ...input, mode: 'pos' })
})
