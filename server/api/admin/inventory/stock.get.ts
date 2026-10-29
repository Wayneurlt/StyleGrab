import { z } from 'zod'
import { pageQuery } from '~~/server/schemas'
import { listStock } from '~~/server/services/inventory'

export default defineApi(async (event) => {
  await requireStaff(event, 'inventory.view')
  const q = query(event, pageQuery.extend({ categoryId: z.string().max(64).optional(), filter: z.enum(['all', 'low', 'out', 'in']).optional() }))
  return listStock({ ...q, ...pagination(q) })
})
