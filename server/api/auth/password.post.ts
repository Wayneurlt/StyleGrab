import { z } from 'zod'
import { changeOwnPassword } from '~~/server/services/auth'

export default defineApi(async (event) => {
  const { user } = await requireStaff(event)
  const input = await body(event, z.object({ current: z.string().min(1).max(200), next: z.string().min(1).max(200) }))
  rateLimit(`pw:${user.id}`, 5, 15 * 60_000)
  await changeOwnPassword(user.id, input.current, input.next)
  deleteCookie(event, STAFF_COOKIE, { path: '/' })
  return { ok: true }
})
