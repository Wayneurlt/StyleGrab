import { prisma } from '~~/server/lib/prisma'
import { pageQuery } from '~~/server/schemas'

export default defineApi(async (event) => {
  const { actor } = await requireStaff(event, 'shifts.manage')
  const q = query(event, pageQuery)
  const { page, pageSize } = pagination(q)
  const all = actor.permissions.has('*') || actor.permissions.has('shifts.view.all')
  const where = all ? {} : { openedById: actor.userId ?? '' }
  const [total, items] = await Promise.all([
    prisma.posShift.count({ where }),
    prisma.posShift.findMany({ where, orderBy: { openedAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize, include: { register: { select: { name: true } } } }),
  ])
  const users = await prisma.user.findMany({ where: { id: { in: [...new Set(items.flatMap(s => [s.openedById, s.closedById]).filter((x): x is string => !!x))] } }, select: { id: true, name: true } })
  return { total, items: items.map(s => ({ ...s, openedBy: users.find(u => u.id === s.openedById)?.name ?? '—', closedBy: users.find(u => u.id === s.closedById)?.name ?? null })) }
})
