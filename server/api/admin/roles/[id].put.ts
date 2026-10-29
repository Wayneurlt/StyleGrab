import { z } from 'zod'
import { ALL_PERMISSIONS } from '~~/shared/permissions'
import { updateRolePermissions } from '~~/server/services/auth'

export default defineApi(async (event) => {
  const { actor } = await requireStaff(event, 'users.manage')
  const { permissions } = await body(event, z.object({ permissions: z.array(z.enum(ALL_PERMISSIONS as [string, ...string[]])).max(100) }))
  await updateRolePermissions(actor, param(event, 'id'), [...new Set(permissions)])
  return { ok: true }
})
