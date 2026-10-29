import { z } from 'zod'
import { loginStaff } from '~~/server/services/auth'

export default defineApi(async (event) => {
  const input = await body(event, z.object({ email: z.string().trim().max(120), password: z.string().min(1).max(200) }))
  const ip = clientIp(event) ?? 'unknown'
  rateLimit(`login:ip:${ip}`, 30, 15 * 60_000)
  rateLimit(`login:email:${input.email.toLowerCase()}`, 8, 15 * 60_000)
  const { token, expiresAt } = await loginStaff(input.email, input.password, { ip, userAgent: getRequestHeader(event, 'user-agent') })
  setSessionCookie(event, STAFF_COOKIE, token, expiresAt)
  return { ok: true }
})
