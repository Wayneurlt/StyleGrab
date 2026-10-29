import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '~~/server/lib/prisma'
import { pageQuery, rangeQuery } from '~~/server/schemas'
import { resolveRange } from '~~/server/services/reports'

/** Read-only audit log. There is intentionally no endpoint to edit or delete events (also blocked in the DB). */
export default defineApi(async (event) => {
  await requireStaff(event, 'audit.view')
  const q = query(event, pageQuery.merge(rangeQuery).extend({ entityType: z.string().max(40).optional(), entityId: z.string().max(64).optional(), actorId: z.string().max(64).optional() }))
  const { page, pageSize } = pagination(q)
  const where: Prisma.AuditEventWhereInput = {}
  if (q.entityType) where.entityType = q.entityType
  if (q.entityId) where.entityId = q.entityId
  if (q.actorId) where.actorId = q.actorId
  if (q.q) where.action = { contains: q.q, mode: 'insensitive' }
  if (q.from || q.to) {
    const r = await resolveRange({ from: q.from ?? '2000-01-01', to: q.to })
    where.createdAt = { gte: r.start, lt: r.end }
  }
  const [total, items] = await Promise.all([
    prisma.auditEvent.count({ where }),
    prisma.auditEvent.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
  ])
  return { total, items }
})
