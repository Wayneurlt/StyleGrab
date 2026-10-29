import { z } from 'zod'
import { prisma } from '~~/server/lib/prisma'
import { currentShiftFor, shiftSummary } from '~~/server/services/shifts'

/** The open shift for a register (or the current user's open shift), with its live summary. */
export default defineApi(async (event) => {
  const { actor } = await requireAny(event, ['pos.sell', 'shifts.manage'])
  const q = query(event, z.object({ registerId: z.string().max(64).optional() }))
  const shift = await currentShiftFor(actor, q.registerId)
  if (!shift) return null
  return shiftSummary(prisma, shift.id)
})
