import { z } from 'zod'
import { setPurchaseOrderStatus } from '~~/server/services/purchasing'

export default defineApi(async (event) => {
  const { actor } = await requireStaff(event, 'purchasing.manage')
  const { status } = await body(event, z.object({ status: z.enum(['ORDERED', 'RECEIVED', 'CANCELLED']) }))
  return setPurchaseOrderStatus(actor, param(event, 'id'), status)
})
