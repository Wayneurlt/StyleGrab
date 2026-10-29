import { adjustmentInput } from '~~/server/schemas'
import { createAdjustment } from '~~/server/services/inventory'

export default defineApi(async (event) => {
  const { actor } = await requireStaff(event, 'inventory.adjust')
  return createAdjustment(actor, await body(event, adjustmentInput))
})
