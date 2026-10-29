import { z } from 'zod'
import { pageQuery } from '~~/server/schemas'
import { listCustomers } from '~~/server/services/customers'

export default defineApi(async (event) => {
  await requireStaff(event, 'customers.view')
  const q = query(event, pageQuery.extend({ status: z.enum(['active', 'inactive']).optional(), balance: z.enum(['1']).optional() }))
  return listCustomers({ ...q, withBalance: q.balance === '1', ...pagination(q) })
})
