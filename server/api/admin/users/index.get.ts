import { prisma } from '~~/server/lib/prisma'

/** Staff list. Managers with orders.manage can see names (for assignment); only users.manage sees full details. */
export default defineApi(async (event) => {
  const { actor } = await requireStaff(event)
  const full = actor.permissions.has('*') || actor.permissions.has('users.manage')
  const users = await prisma.user.findMany({ orderBy: [{ isActive: 'desc' }, { name: 'asc' }], include: { role: { select: { id: true, key: true, name: true } } } })
  return users.map(u => full
    ? { id: u.id, name: u.name, email: u.email, isActive: u.isActive, role: u.role, lastLoginAt: u.lastLoginAt, createdAt: u.createdAt }
    : { id: u.id, name: u.name, isActive: u.isActive })
})
