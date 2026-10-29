import { destroySession } from '~~/server/services/auth'

export default defineApi(async (event) => {
  await destroySession(getCookie(event, STAFF_COOKIE))
  deleteCookie(event, STAFF_COOKIE, { path: '/' })
  return { ok: true }
})
