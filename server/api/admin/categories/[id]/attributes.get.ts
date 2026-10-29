import { prisma } from '~~/server/lib/prisma'
import { effectiveAttributes } from '~~/server/services/catalog'

/** Attributes that apply to products in this category (own + inherited). Drives the variant form. */
export default defineApi(async (event) => {
  await requireStaff(event, 'catalog.view')
  return effectiveAttributes(prisma, param(event, 'id'))
})
