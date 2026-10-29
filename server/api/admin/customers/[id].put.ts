import { customerInput } from '~~/server/schemas'
import { updateCustomer } from '~~/server/services/customers'

export default defineApi(async (event) => {
  const { actor } = await requireStaff(event, 'customers.manage')
  return updateCustomer(actor, param(event, 'id'), await body(event, customerInput.partial()))
})
