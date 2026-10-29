import { z } from 'zod'
import { paymentInput } from '~~/server/schemas'
import { recordPayment } from '~~/server/services/payments'

export default defineApi(async (event) => {
  const { actor } = await requireStaff(event, 'payments.record')
  const input = await body(event, paymentInput.extend({ shiftId: z.string().max(64).nullish() }))
  const { shiftId, ...payment } = input
  return recordPayment(actor, param(event, 'id'), payment, { shiftId })
})
