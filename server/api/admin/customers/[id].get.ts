import { getCustomer } from '~~/server/services/customers'

export default defineApi(async (event) => {
  const { actor } = await requireStaff(event, 'customers.view')
  return getCustomer(actor, param(event, 'id'))
})
