import { z } from 'zod'
import { money } from '~~/server/schemas'
import { closeShift } from '~~/server/services/shifts'

export default defineApi(async (event) => {
  const { actor } = await requireStaff(event, 'shifts.manage')
  const input = await body(event, z.object({ countedCash: money, notes: z.string().trim().max(1000).nullish() }))
  return closeShift(actor, param(event, 'id'), input)
})
