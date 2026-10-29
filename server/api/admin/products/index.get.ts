import { z } from 'zod'
import { pageQuery } from '~~/server/schemas'
import { listProductsAdmin } from '~~/server/services/catalog'

export default defineApi(async (event) => {
  await requireStaff(event, 'catalog.view')
  const q = query(event, pageQuery.extend({
    categoryId: z.string().max(64).optional(),
    status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional(),
    stock: z.enum(['in', 'out', 'low']).optional(),
  }))
  return listProductsAdmin({ ...q, ...pagination(q) })
})
