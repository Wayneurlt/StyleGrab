import { z } from 'zod'
import { decideAdjustment } from '~~/server/services/inventory'

export default defineApi(async (event) => {
  const { actor } = await requireStaff(event, 'inventory.adjust.approve')
  const input = await body(event, z.object({ approve: z.boolean(), note: z.string().trim().max(500).optional() }))
  return decideAdjustment(actor, param(event, 'id'), input.approve, input.note)
})
