import { customerInput } from '~~/server/schemas'
import { createCustomer } from '~~/server/services/customers'

export default defineApi(async (event) => {
  const { actor } = await requireStaff(event, 'customers.manage')
  return createCustomer(actor, await body(event, customerInput))
})
