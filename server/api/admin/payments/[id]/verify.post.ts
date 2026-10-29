import { z } from 'zod'
import { verifyPayment } from '~~/server/services/payments'

export default defineApi(async (event) => {
  const { actor } = await requireStaff(event, 'payments.verify')
  const input = await body(event, z.object({ approve: z.boolean(), note: z.string().trim().max(500).nullish() }))
  return verifyPayment(actor, param(event, 'id'), input)
})
