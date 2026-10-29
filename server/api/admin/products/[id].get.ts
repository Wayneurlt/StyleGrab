import { getProductAdmin } from '~~/server/services/catalog'

export default defineApi(async (event) => {
  await requireStaff(event, 'catalog.view')
  return getProductAdmin(param(event, 'id'))
})
