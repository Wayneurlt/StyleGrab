import { prisma } from '~~/server/lib/prisma'

export default defineApi(async (event) => {
  await requireStaff(event, 'catalog.view')
  const includeArchived = getQuery(event).archived === '1'
  return prisma.category.findMany({
    where: includeArchived ? {} : { isArchived: false },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { attributes: { orderBy: { sortOrder: 'asc' } }, _count: { select: { products: true } } },
  })
})
