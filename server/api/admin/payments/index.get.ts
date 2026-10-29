import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '~~/server/lib/prisma'
import { pageQuery } from '~~/server/schemas'

/** Payment records, e.g. the "awaiting confirmation" queue for verifying M-Pesa/bank references. */
export default defineApi(async (event) => {
  await requireStaff(event, 'orders.view')
  const q = query(event, pageQuery.extend({ status: z.enum(['PENDING_CONFIRMATION', 'CONFIRMED', 'FAILED', 'VOIDED']).optional(), methodId: z.string().max(64).optional() }))
  const { page, pageSize } = pagination(q)
  const where: Prisma.PaymentRecordWhereInput = {}
  if (q.status) where.status = q.status
  if (q.methodId) where.methodId = q.methodId
  if (q.q) where.OR = [{ reference: { contains: q.q.toUpperCase() } }, { order: { number: { contains: q.q, mode: 'insensitive' } } }]
  const [total, items] = await Promise.all([
    prisma.paymentRecord.count({ where }),
    prisma.paymentRecord.findMany({ where, orderBy: { receivedAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize, include: { method: { select: { name: true, type: true } }, order: { select: { id: true, number: true, total: true, contactName: true, customer: { select: { name: true } } } } } }),
  ])
  const users = await prisma.user.findMany({ where: { id: { in: [...new Set(items.flatMap(i => [i.recordedById, i.verifiedById]).filter((x): x is string => !!x))] } }, select: { id: true, name: true } })
  return { total, items: items.map(i => ({ ...i, recordedBy: users.find(u => u.id === i.recordedById)?.name ?? null, verifiedBy: users.find(u => u.id === i.verifiedById)?.name ?? null })) }
})
