import { manualOrderInput } from '~~/server/schemas'
import { createOrder } from '~~/server/services/orders'

/** Manual orders from WhatsApp, Instagram, Facebook, phone, etc. Same pricing and inventory services as every channel. */
export default defineApi(async (event) => {
  const { actor } = await requireStaff(event, 'orders.manage')
  const input = await body(event, manualOrderInput)
  return createOrder(actor, { ...input, mode: 'manual' })
})
