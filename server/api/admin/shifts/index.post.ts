import { z } from 'zod'
import { money } from '~~/server/schemas'
import { openShift } from '~~/server/services/shifts'

export default defineApi(async (event) => {
  const { actor } = await requireStaff(event, 'shifts.manage')
  return openShift(actor, await body(event, z.object({ registerId: z.string().max(64), openingCash: money })))
})
