import { returnInput } from '~~/server/schemas'
import { createReturn } from '~~/server/services/returns'

export default defineApi(async (event) => {
  const { actor } = await requireStaff(event, 'returns.create')
  return createReturn(actor, await body(event, returnInput))
})
