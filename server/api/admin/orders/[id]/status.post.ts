import { z } from 'zod'
import { transitionOrder } from '~~/server/services/orders'

export default defineApi(async (event) => {
  const input = await body(event, z.object({ status: z.enum(['CONFIRMED', 'PROCESSING', 'READY', 'COMPLETED', 'CANCELLED']), note: z.string().trim().max(500).nullish() }))
  const { actor } = await requireStaff(event, input.status === 'CANCELLED' ? 'orders.cancel' : 'orders.manage')
  return transitionOrder(actor, param(event, 'id'), input.status, input.note)
})
