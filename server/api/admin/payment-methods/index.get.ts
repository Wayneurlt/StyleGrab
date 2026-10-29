import { prisma } from '~~/server/lib/prisma'

export default defineApi(async (event) => {
  await requireStaff(event)
  return prisma.paymentMethod.findMany({ orderBy: { sortOrder: 'asc' } })
})
