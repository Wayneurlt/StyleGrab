import { z } from 'zod'
import { prisma } from '~~/server/lib/prisma'

/** Global command-bar search across products, orders and customers, filtered by the caller's permissions. */
export default defineApi(async (event) => {
  const { actor } = await requireStaff(event)
  const has = (p: string) => actor.permissions.has('*') || actor.permissions.has(p)
  const { q } = query(event, z.object({ q: z.string().trim().min(1).max(80) }))
  const digits = q.replace(/\D/g, '')
  const [products, orders, customers] = await Promise.all([
    has('catalog.view')
      ? prisma.product.findMany({ where: { searchText: { contains: q.toLowerCase() }, status: { not: 'ARCHIVED' } }, take: 5, select: { id: true, name: true, code: true, status: true } })
      : [],
    has('orders.view')
      ? prisma.order.findMany({ where: { OR: [{ number: { contains: q, mode: 'insensitive' } }, { contactName: { contains: q, mode: 'insensitive' } }, { customer: { name: { contains: q, mode: 'insensitive' } } }] }, take: 5, orderBy: { placedAt: 'desc' }, select: { id: true, number: true, total: true, status: true, contactName: true, customer: { select: { name: true } } } })
      : [],
    has('customers.view')
      ? prisma.customer.findMany({ where: { OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q.toLowerCase() } }, ...(digits.length >= 4 ? [{ phone: { contains: digits.slice(-9) } }] : [])] }, take: 5, select: { id: true, name: true, phone: true } })
      : [],
  ])
  return { products, orders, customers }
})
