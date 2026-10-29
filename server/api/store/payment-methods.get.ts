import { prisma } from '~~/server/lib/prisma'

/** Public: how customers can pay outside the site (instructions only; nothing is charged online). */
export default defineApi(() => prisma.paymentMethod.findMany({
  where: { isActive: true, type: { notIn: ['EXCHANGE_CREDIT', 'CARD_TERMINAL'] } },
  orderBy: { sortOrder: 'asc' },
  select: { id: true, name: true, type: true, instructions: true },
}))
