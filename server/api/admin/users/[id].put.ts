import { z } from 'zod'
import { updateUser } from '~~/server/services/auth'

export default defineApi(async (event) => {
  const { actor } = await requireStaff(event, 'users.manage')
  const input = await body(event, z.object({ name: z.string().trim().min(1).max(120).optional(), roleId: z.string().max(64).optional(), isActive: z.boolean().optional(), password: z.string().min(1).max(200).optional() }))
  const user = await updateUser(actor, param(event, 'id'), input)
  return { id: user.id }
})
