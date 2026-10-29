import { prisma } from '~~/server/lib/prisma'
import { shiftSummary } from '~~/server/services/shifts'

export default defineApi(async (event) => {
  const { actor } = await requireStaff(event, 'shifts.manage')
  const summary = await shiftSummary(prisma, param(event, 'id'))
  if (summary.shift.openedById !== actor.userId && !actor.permissions.has('*') && !actor.permissions.has('shifts.view.all')) {
    throw createError({ statusCode: 403, statusMessage: 'forbidden', message: 'This shift belongs to another cashier' })
  }
  const users = await prisma.user.findMany({ where: { id: { in: [summary.shift.openedById, summary.shift.closedById ?? '', ...summary.shift.cashMovements.map(m => m.recordedById)] } }, select: { id: true, name: true } })
  return { ...summary, users: Object.fromEntries(users.map(u => [u.id, u.name])) }
})
