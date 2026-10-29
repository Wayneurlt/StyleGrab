import { z } from 'zod'
import { updateOrderNotes } from '~~/server/services/orders'

export default defineApi(async (event) => {
  const { actor } = await requireStaff(event, 'orders.manage')
  const input = await body(event, z.object({ internalNote: z.string().trim().max(2000).nullish(), assignedToId: z.string().max(64).nullish() }))
  return updateOrderNotes(actor, param(event, 'id'), input)
})
