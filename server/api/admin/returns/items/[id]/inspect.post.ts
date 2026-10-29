import { z } from 'zod'
import { resolveInspection } from '~~/server/services/returns'

export default defineApi(async (event) => {
  const { actor } = await requireStaff(event, 'returns.create')
  const input = await body(event, z.object({ saleable: z.boolean() }))
  await resolveInspection(actor, param(event, 'id'), input.saleable)
  return { ok: true }
})
