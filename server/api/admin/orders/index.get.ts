import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '~~/server/lib/prisma'
import { pageQuery, rangeQuery } from '~~/server/schemas'
import { outstandingBalance } from '~~/server/services/payments'
import { resolveRange } from '~~/server/services/reports'

export default defineApi(async (event) => {
  await requireStaff(event, 'orders.view')
  const q = query(event, pageQuery.merge(rangeQuery).extend({
    channel: z.enum(['WEBSITE', 'POS', 'WHATSAPP', 'INSTAGRAM', 'FACEBOOK', 'PHONE', 'OTHER']).optional(),
    status: z.enum(['PENDING', 'CONFIRMED', 'PROCESSING', 'READY', 'COMPLETED', 'CANCELLED', 'OPEN']).optional(),
    paymentStatus: z.enum(['UNPAID', 'AWAITING_CONFIRMATION', 'PARTIALLY_PAID', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED']).optional(),
    customerId: z.string().max(64).optional(),
    sort: z.enum(['newest', 'oldest', 'total_desc', 'total_asc']).optional(),
  }))
  const { page, pageSize } = pagination(q)
  const where: Prisma.OrderWhereInput = {}
  if (q.channel) where.channel = q.channel
  if (q.status === 'OPEN') where.status = { in: ['PENDING', 'CONFIRMED', 'PROCESSING', 'READY'] }
  else if (q.status) where.status = q.status
  if (q.paymentStatus) where.paymentStatus = q.paymentStatus
  if (q.customerId) where.customerId = q.customerId
  if (q.from || q.to) {
    const r = await resolveRange({ from: q.from ?? '2000-01-01', to: q.to })
    where.placedAt = { gte: r.start, lt: r.end }
  }
  if (q.q) {
    const digits = q.q.replace(/\D/g, '')
    where.OR = [
      { number: { contains: q.q, mode: 'insensitive' } },
      { contactName: { contains: q.q, mode: 'insensitive' } },
      { customer: { name: { contains: q.q, mode: 'insensitive' } } },
      ...(digits.length >= 4 ? [{ contactPhone: { contains: digits.slice(-9) } }, { customer: { phone: { contains: digits.slice(-9) } } }] : []),
      { items: { some: { sku: { contains: q.q, mode: 'insensitive' } } } },
    ]
  }
  const orderBy: Prisma.OrderOrderByWithRelationInput = q.sort === 'oldest' ? { placedAt: 'asc' } : q.sort === 'total_desc' ? { total: 'desc' } : q.sort === 'total_asc' ? { total: 'asc' } : { placedAt: 'desc' }
  const [total, rows] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where, orderBy, skip: (page - 1) * pageSize, take: pageSize,
      select: {
        id: true, number: true, channel: true, status: true, paymentStatus: true, total: true, amountPaid: true, amountRefunded: true, amountReturned: true, amountPending: true,
        placedAt: true, contactName: true, assignedToId: true, createdById: true,
        customer: { select: { id: true, name: true } }, items: { take: 1, select: { productName: true } }, _count: { select: { items: true } },
      },
    }),
  ])
  const users = await prisma.user.findMany({ where: { id: { in: [...new Set(rows.flatMap(r => [r.assignedToId, r.createdById]).filter((x): x is string => !!x))] } }, select: { id: true, name: true } })
  return {
    total,
    items: rows.map(o => ({
      ...o,
      customerName: o.customer?.name ?? o.contactName ?? 'Walk-in',
      firstItem: o.items[0]?.productName ?? '',
      itemCount: o._count.items,
      balance: o.status === 'CANCELLED' ? 0 : outstandingBalance(o),
      assignedTo: users.find(u => u.id === o.assignedToId)?.name ?? null,
      createdBy: users.find(u => u.id === o.createdById)?.name ?? null,
    })),
  }
})
