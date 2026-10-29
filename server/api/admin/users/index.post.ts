import { z } from 'zod'
import { createUser } from '~~/server/services/auth'

export default defineApi(async (event) => {
  const { actor } = await requireStaff(event, 'users.manage')
  const input = await body(event, z.object({ email: z.string().trim().email().max(120), name: z.string().trim().min(1).max(120), roleId: z.string().max(64), password: z.string().min(1).max(200) }))
  const user = await createUser(actor, input)
  return { id: user.id }
})
