import { z } from 'zod'
import { money } from '~~/server/schemas'
import { addCashMovement } from '~~/server/services/shifts'

export default defineApi(async (event) => {
  const { actor } = await requireStaff(event, 'shifts.manage')
  const input = await body(event, z.object({ type: z.enum(['PAY_IN', 'PAY_OUT']), amount: money, reason: z.string().trim().min(2).max(300) }))
  return addCashMovement(actor, param(event, 'id'), input)
})
