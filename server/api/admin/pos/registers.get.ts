import { prisma } from '~~/server/lib/prisma'

export default defineApi(async (event) => {
  await requireAny(event, ['pos.sell', 'shifts.manage'])
  return prisma.posRegister.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
    include: { shifts: { where: { status: 'OPEN' }, select: { id: true, openedById: true, openedAt: true } } },
  })
})
