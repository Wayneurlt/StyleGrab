import { z } from 'zod'
import { voidPayment } from '~~/server/services/payments'

export default defineApi(async (event) => {
  const { actor } = await requireStaff(event, 'payments.void')
  const input = await body(event, z.object({ reason: z.string().trim().min(3).max(500) }))
  return voidPayment(actor, param(event, 'id'), input.reason)
})
