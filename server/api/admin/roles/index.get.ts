import { prisma } from '~~/server/lib/prisma'
import { PERMISSIONS } from '~~/shared/permissions'

export default defineApi(async (event) => {
  await requireStaff(event, 'users.manage')
  const roles = await prisma.role.findMany({ orderBy: { createdAt: 'asc' }, include: { _count: { select: { users: true } } } })
  return { roles, permissions: PERMISSIONS }
})
