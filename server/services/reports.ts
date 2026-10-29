import { Prisma, type SalesChannel } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { getSettings } from '../lib/settings'

/**
 * Reporting rules (see docs/BUSINESS_RULES.md):
 * - Revenue is recognised when an order is COMPLETED (POS sales complete immediately), at line totals net of discounts.
 * - Returns reduce revenue in the period of the original sale (credit stored on the order).
 * - COGS = (sold qty − returned qty) × unit cost snapshot taken at deduction time (weighted average cost).
 *   Lines with no known cost are excluded from margin figures and counted separately — never estimated.
 * - Payment figures are records entered by staff, not independently verified bank/M-Pesa statements.
 */

export interface Range { from: string, to: string }

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Convert inclusive business-timezone dates into a UTC [start, end) window. */
export async function resolveRange(range: Partial<Range>) {
  const { timezone } = await getSettings()
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date())
  const from = range.from && DATE_RE.test(range.from) ? range.from : today
  const to = range.to && DATE_RE.test(range.to) ? range.to : today
  const rows = await prisma.$queryRaw<{ start: Date, end: Date }[]>`
    SELECT ((${from}::timestamp) AT TIME ZONE ${timezone}) AS "start",
           (((${to}::date + 1)::timestamp) AT TIME ZONE ${timezone}) AS "end"`
  return { from, to, start: rows[0]!.start, end: rows[0]!.end, timezone, today }
}

export async function dashboard(range: Partial<Range>) {
  const r = await resolveRange(range)
  const todayRange = await resolveRange({ from: r.today, to: r.today })

  const [salesToday, salesPeriod, returnsPeriod, ordersPeriod, outstanding, stock, pendingPayments, pendingAdjustments, openOrders] = await Promise.all([
    prisma.order.aggregate({ where: { status: 'COMPLETED', completedAt: { gte: todayRange.start, lt: todayRange.end } }, _sum: { total: true, amountReturned: true }, _count: true }),
    prisma.order.aggregate({ where: { status: 'COMPLETED', completedAt: { gte: r.start, lt: r.end } }, _sum: { total: true, amountReturned: true, discountTotal: true }, _count: true }),
    prisma.return.aggregate({ where: { createdAt: { gte: r.start, lt: r.end } }, _sum: { creditAmount: true }, _count: true }),
    prisma.order.count({ where: { placedAt: { gte: r.start, lt: r.end }, status: { not: 'CANCELLED' } } }),
    prisma.$queryRaw<{ amount: bigint | null, orders: bigint }[]>`
      SELECT SUM("total" - "amountReturned" - ("amountPaid" - "amountRefunded")) AS amount, COUNT(*) AS orders
      FROM "Order" WHERE "status" <> 'CANCELLED' AND "total" - "amountReturned" - ("amountPaid" - "amountRefunded") > 0`,
    prisma.$queryRaw<{ low: bigint, out: bigint, units: bigint | null, value: bigint | null, missingCost: bigint }[]>`
      SELECT COUNT(*) FILTER (WHERE b."onHand" - b."reserved" > 0 AND b."onHand" - b."reserved" <= b."lowStockThreshold") AS low,
             COUNT(*) FILTER (WHERE b."onHand" - b."reserved" <= 0) AS out,
             SUM(b."onHand") AS units,
             SUM(b."onHand"::bigint * COALESCE(b."avgCost", 0)) AS value,
             COUNT(*) FILTER (WHERE b."onHand" > 0 AND b."avgCost" IS NULL) AS "missingCost"
      FROM "InventoryBalance" b JOIN "ProductVariant" v ON v."id" = b."variantId" JOIN "Product" p ON p."id" = v."productId"
      WHERE NOT v."isArchived" AND p."status" <> 'ARCHIVED'`,
    prisma.paymentRecord.aggregate({ where: { status: 'PENDING_CONFIRMATION' }, _sum: { amount: true }, _count: true }),
    prisma.stockAdjustment.count({ where: { status: 'PENDING_APPROVAL' } }),
    prisma.order.count({ where: { status: { in: ['PENDING', 'CONFIRMED', 'PROCESSING', 'READY'] } } }),
  ])

  const methods = await prisma.paymentRecord.groupBy({ by: ['methodId', 'status'], where: { receivedAt: { gte: r.start, lt: r.end }, status: { in: ['CONFIRMED', 'PENDING_CONFIRMATION'] } }, _sum: { amount: true }, _count: true })
  const methodRows = await prisma.paymentMethod.findMany({ where: { type: { not: 'EXCHANGE_CREDIT' } }, orderBy: { sortOrder: 'asc' } })

  // Eight-month revenue vs COGS series for the chart.
  const monthStart = `${r.today.slice(0, 7)}-01`
  const first = new Date(`${monthStart}T00:00:00Z`)
  first.setUTCMonth(first.getUTCMonth() - 7)
  const firstMonth = first.toISOString().slice(0, 10)
  const series = await prisma.$queryRaw<{ month: string, revenue: bigint | null, cogs: bigint | null }[]>`
    SELECT to_char(date_trunc('month', (o."completedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${r.timezone}), 'YYYY-MM') AS month,
           SUM(i."lineTotal" - ROUND(i."lineTotal"::numeric * i."returnedQty" / i."quantity")) AS revenue,
           SUM((i."quantity" - i."returnedQty")::bigint * i."unitCost") AS cogs
    FROM "OrderItem" i JOIN "Order" o ON o."id" = i."orderId"
    WHERE o."status" = 'COMPLETED' AND o."completedAt" >= ((${firstMonth}::timestamp) AT TIME ZONE ${r.timezone})
    GROUP BY 1 ORDER BY 1`
  const months: { month: string, revenue: number, cogs: number }[] = []
  for (let i = 0; i < 8; i++) {
    const d = new Date(first)
    d.setUTCMonth(first.getUTCMonth() + i)
    const key = d.toISOString().slice(0, 7)
    const row = series.find(s => s.month === key)
    months.push({ month: key, revenue: Number(row?.revenue ?? 0), cogs: Number(row?.cogs ?? 0) })
  }

  const [recentOrders, recentMovements, bestSellers, lowStock] = await Promise.all([
    prisma.order.findMany({ orderBy: { placedAt: 'desc' }, take: 8, select: { id: true, number: true, channel: true, status: true, paymentStatus: true, total: true, placedAt: true, contactName: true, customer: { select: { name: true } }, items: { take: 1, select: { productName: true } }, _count: { select: { items: true } } } }),
    prisma.inventoryMovement.findMany({ where: { type: { notIn: ['RESERVATION', 'RESERVATION_RELEASE'] } }, orderBy: { createdAt: 'desc' }, take: 8, include: { variant: { select: { sku: true, title: true, product: { select: { name: true } } } } } }),
    prisma.$queryRaw<{ productId: string, name: string, qty: bigint, revenue: bigint }[]>`
      SELECT i."productId", MAX(i."productName") AS name, SUM(i."quantity" - i."returnedQty") AS qty,
             SUM(i."lineTotal" - ROUND(i."lineTotal"::numeric * i."returnedQty" / i."quantity"))::bigint AS revenue
      FROM "OrderItem" i JOIN "Order" o ON o."id" = i."orderId"
      WHERE o."status" = 'COMPLETED' AND o."completedAt" >= ${r.start} AND o."completedAt" < ${r.end}
      GROUP BY i."productId" HAVING SUM(i."quantity" - i."returnedQty") > 0 ORDER BY qty DESC LIMIT 5`,
    prisma.$queryRaw<{ variantId: string, sku: string, title: string, name: string, available: number, threshold: number }[]>`
      SELECT v."id" AS "variantId", v."sku", v."title", p."name", b."onHand" - b."reserved" AS available, b."lowStockThreshold" AS threshold
      FROM "InventoryBalance" b JOIN "ProductVariant" v ON v."id" = b."variantId" JOIN "Product" p ON p."id" = v."productId"
      WHERE NOT v."isArchived" AND p."status" = 'ACTIVE' AND b."onHand" - b."reserved" <= b."lowStockThreshold"
      ORDER BY available ASC, p."name" LIMIT 6`,
  ])

  const periodGross = salesPeriod._sum.total ?? 0
  const periodReturns = salesPeriod._sum.amountReturned ?? 0
  const s = stock[0]!
  return {
    range: { from: r.from, to: r.to },
    salesToday: { net: (salesToday._sum.total ?? 0) - (salesToday._sum.amountReturned ?? 0), count: salesToday._count },
    salesPeriod: { gross: periodGross, net: periodGross - periodReturns, discounts: salesPeriod._sum.discountTotal ?? 0, count: salesPeriod._count },
    returnsPeriod: { credit: returnsPeriod._sum.creditAmount ?? 0, count: returnsPeriod._count },
    ordersPeriod,
    openOrders,
    outstanding: { amount: Number(outstanding[0]?.amount ?? 0), orders: Number(outstanding[0]?.orders ?? 0) },
    stock: { low: Number(s.low), out: Number(s.out), units: Number(s.units ?? 0), value: Number(s.value ?? 0), missingCost: Number(s.missingCost) },
    pendingPayments: { amount: pendingPayments._sum.amount ?? 0, count: pendingPayments._count },
    pendingAdjustments,
    paymentMethods: methodRows.map(m => ({
      id: m.id, name: m.name, type: m.type, isActive: m.isActive,
      confirmed: methods.filter(x => x.methodId === m.id && x.status === 'CONFIRMED').reduce((a, x) => a + (x._sum.amount ?? 0), 0),
      pending: methods.filter(x => x.methodId === m.id && x.status === 'PENDING_CONFIRMATION').reduce((a, x) => a + (x._sum.amount ?? 0), 0),
      count: methods.filter(x => x.methodId === m.id).reduce((a, x) => a + x._count, 0),
    })),
    months,
    recentOrders: recentOrders.map(o => ({ ...o, customerName: o.customer?.name ?? o.contactName ?? 'Walk-in', firstItem: o.items[0]?.productName ?? '', itemCount: o._count.items })),
    recentMovements,
    bestSellers: bestSellers.map(b => ({ ...b, qty: Number(b.qty), revenue: Number(b.revenue) })),
    lowStock,
  }
}

export interface SalesFilters extends Partial<Range> {
  channel?: SalesChannel
  categoryId?: string
  productId?: string
  staffId?: string
  methodId?: string
  paymentStatus?: string
  page?: number
  pageSize?: number
}

function salesWhere(f: SalesFilters, start: Date, end: Date): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = { status: 'COMPLETED', completedAt: { gte: start, lt: end } }
  if (f.channel) where.channel = f.channel
  if (f.staffId) where.createdById = f.staffId
  if (f.paymentStatus) where.paymentStatus = f.paymentStatus as Prisma.EnumPaymentStatusFilter['equals']
  if (f.methodId) where.payments = { some: { methodId: f.methodId, status: { in: ['CONFIRMED', 'PENDING_CONFIRMATION'] } } }
  if (f.productId) where.items = { some: { productId: f.productId } }
  if (f.categoryId) where.items = { some: { variant: { product: { categoryId: f.categoryId } } } }
  return where
}

export async function salesReport(f: SalesFilters) {
  const r = await resolveRange(f)
  const where = salesWhere(f, r.start, r.end)
  const page = f.page ?? 1
  const pageSize = Math.min(f.pageSize ?? 25, 5000)
  const [total, orders, sums] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where, orderBy: { completedAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize,
      select: { id: true, number: true, channel: true, paymentStatus: true, subtotal: true, discountTotal: true, total: true, amountPaid: true, amountRefunded: true, amountReturned: true, completedAt: true, createdById: true, contactName: true, customer: { select: { name: true } }, _count: { select: { items: true } } },
    }),
    prisma.order.aggregate({ where, _sum: { subtotal: true, discountTotal: true, total: true, amountReturned: true, amountPaid: true, amountRefunded: true }, _count: true }),
  ])
  const ids = await prisma.order.findMany({ where, select: { id: true } })
  const idList = ids.map(i => i.id)
  const byDay = idList.length
    ? await prisma.$queryRaw<{ day: string, net: bigint, orders: bigint }[]>`
        SELECT to_char((o."completedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${r.timezone}, 'YYYY-MM-DD') AS day,
               SUM(o."total" - o."amountReturned") AS net, COUNT(*) AS orders
        FROM "Order" o WHERE o."id" IN (${Prisma.join(idList)}) GROUP BY 1 ORDER BY 1`
    : []
  const byProduct = idList.length
    ? await prisma.$queryRaw<{ productId: string, name: string, category: string, qty: bigint, revenue: bigint }[]>`
        SELECT i."productId", MAX(i."productName") AS name, MAX(c."name") AS category, SUM(i."quantity" - i."returnedQty") AS qty,
               SUM(i."lineTotal" - ROUND(i."lineTotal"::numeric * i."returnedQty" / i."quantity"))::bigint AS revenue
        FROM "OrderItem" i JOIN "Product" p ON p."id" = i."productId" JOIN "Category" c ON c."id" = p."categoryId"
        WHERE i."orderId" IN (${Prisma.join(idList)}) GROUP BY i."productId" ORDER BY revenue DESC LIMIT 50`
    : []
  const staff = await prisma.user.findMany({ where: { id: { in: [...new Set(orders.map(o => o.createdById).filter((x): x is string => !!x))] } }, select: { id: true, name: true } })
  return {
    range: { from: r.from, to: r.to },
    total,
    summary: {
      orders: sums._count,
      gross: sums._sum.subtotal ?? 0,
      discounts: sums._sum.discountTotal ?? 0,
      sales: sums._sum.total ?? 0,
      returns: sums._sum.amountReturned ?? 0,
      net: (sums._sum.total ?? 0) - (sums._sum.amountReturned ?? 0),
      paid: (sums._sum.amountPaid ?? 0) - (sums._sum.amountRefunded ?? 0),
    },
    orders: orders.map(o => ({ ...o, customerName: o.customer?.name ?? o.contactName ?? 'Walk-in', staff: staff.find(s => s.id === o.createdById)?.name ?? '—', itemCount: o._count.items })),
    byDay: byDay.map(d => ({ day: d.day, net: Number(d.net), orders: Number(d.orders) })),
    byProduct: byProduct.map(p => ({ ...p, qty: Number(p.qty), revenue: Number(p.revenue) })),
  }
}

export async function profitReport(f: Partial<Range> & { categoryId?: string }) {
  const r = await resolveRange(f)
  const rows = await prisma.$queryRaw<{ categoryId: string, category: string, revenue: bigint | null, costedRevenue: bigint | null, cogs: bigint | null, units: bigint | null, uncostedLines: bigint, uncostedRevenue: bigint | null }[]>`
    SELECT c."id" AS "categoryId", c."name" AS category,
           SUM(i."lineTotal" - ROUND(i."lineTotal"::numeric * i."returnedQty" / i."quantity"))::bigint AS revenue,
           SUM(CASE WHEN i."unitCost" IS NOT NULL THEN i."lineTotal" - ROUND(i."lineTotal"::numeric * i."returnedQty" / i."quantity") END)::bigint AS "costedRevenue",
           SUM(CASE WHEN i."unitCost" IS NOT NULL THEN (i."quantity" - i."returnedQty")::bigint * i."unitCost" END) AS cogs,
           SUM(i."quantity" - i."returnedQty") AS units,
           COUNT(*) FILTER (WHERE i."unitCost" IS NULL) AS "uncostedLines",
           SUM(CASE WHEN i."unitCost" IS NULL THEN i."lineTotal" - ROUND(i."lineTotal"::numeric * i."returnedQty" / i."quantity") END)::bigint AS "uncostedRevenue"
    FROM "OrderItem" i
    JOIN "Order" o ON o."id" = i."orderId"
    JOIN "Product" p ON p."id" = i."productId"
    JOIN "Category" c ON c."id" = p."categoryId"
    WHERE o."status" = 'COMPLETED' AND o."completedAt" >= ${r.start} AND o."completedAt" < ${r.end}
      ${f.categoryId ? Prisma.sql`AND c."id" = ${f.categoryId}` : Prisma.empty}
    GROUP BY c."id", c."name" ORDER BY revenue DESC`
  const shrinkage = await prisma.$queryRaw<{ type: string, units: bigint | null, value: bigint | null, unvalued: bigint }[]>`
    SELECT m."type", SUM(-m."qtyOnHand") AS units, SUM(-m."qtyOnHand"::bigint * m."unitCost") AS value, COUNT(*) FILTER (WHERE m."unitCost" IS NULL) AS unvalued
    FROM "InventoryMovement" m
    WHERE m."type" IN ('DAMAGE', 'LOSS') AND m."createdAt" >= ${r.start} AND m."createdAt" < ${r.end}
    GROUP BY m."type"`
  const categories = rows.map((x) => {
    const costedRevenue = Number(x.costedRevenue ?? 0)
    const cogs = Number(x.cogs ?? 0)
    return {
      categoryId: x.categoryId, category: x.category, revenue: Number(x.revenue ?? 0), units: Number(x.units ?? 0),
      costedRevenue, cogs, grossProfit: costedRevenue - cogs, margin: costedRevenue ? (costedRevenue - cogs) / costedRevenue : null,
      uncostedLines: Number(x.uncostedLines), uncostedRevenue: Number(x.uncostedRevenue ?? 0),
    }
  })
  const totals = categories.reduce((a, c) => ({
    revenue: a.revenue + c.revenue, costedRevenue: a.costedRevenue + c.costedRevenue, cogs: a.cogs + c.cogs, uncostedLines: a.uncostedLines + c.uncostedLines, uncostedRevenue: a.uncostedRevenue + c.uncostedRevenue,
  }), { revenue: 0, costedRevenue: 0, cogs: 0, uncostedLines: 0, uncostedRevenue: 0 })
  return {
    range: { from: r.from, to: r.to },
    method: 'Weighted average cost',
    totals: { ...totals, grossProfit: totals.costedRevenue - totals.cogs, margin: totals.costedRevenue ? (totals.costedRevenue - totals.cogs) / totals.costedRevenue : null },
    categories,
    shrinkage: shrinkage.map(s => ({ type: s.type, units: Number(s.units ?? 0), value: Number(s.value ?? 0), unvalued: Number(s.unvalued) })),
  }
}

export async function reconciliationReport(f: Partial<Range>) {
  const r = await resolveRange(f)
  const [sales, payments, refunds, methods, shifts, outstanding] = await Promise.all([
    prisma.order.aggregate({ where: { status: 'COMPLETED', completedAt: { gte: r.start, lt: r.end } }, _sum: { total: true, amountReturned: true }, _count: true }),
    prisma.paymentRecord.groupBy({ by: ['methodId', 'status'], where: { receivedAt: { gte: r.start, lt: r.end } }, _sum: { amount: true }, _count: true }),
    prisma.refund.groupBy({ by: ['methodId'], where: { createdAt: { gte: r.start, lt: r.end } }, _sum: { amount: true }, _count: true }),
    prisma.paymentMethod.findMany({ orderBy: { sortOrder: 'asc' } }),
    prisma.posShift.findMany({ where: { openedAt: { gte: r.start, lt: r.end } }, include: { register: { select: { name: true } } }, orderBy: { openedAt: 'desc' } }),
    prisma.$queryRaw<{ id: string, number: string, channel: string, total: number, due: number, placedAt: Date, name: string | null }[]>`
      SELECT o."id", o."number", o."channel", o."total", (o."total" - o."amountReturned" - (o."amountPaid" - o."amountRefunded"))::int AS due, o."placedAt",
             COALESCE(c."name", o."contactName") AS name
      FROM "Order" o LEFT JOIN "Customer" c ON c."id" = o."customerId"
      WHERE o."status" <> 'CANCELLED' AND o."total" - o."amountReturned" - (o."amountPaid" - o."amountRefunded") > 0
      ORDER BY o."placedAt" ASC LIMIT 200`,
  ])
  const users = await prisma.user.findMany({ where: { id: { in: shifts.flatMap(s => [s.openedById, s.closedById]).filter((x): x is string => !!x) } }, select: { id: true, name: true } })
  const byMethod = methods.map(m => ({
    methodId: m.id, name: m.name, type: m.type,
    confirmed: payments.filter(p => p.methodId === m.id && p.status === 'CONFIRMED').reduce((a, p) => a + (p._sum.amount ?? 0), 0),
    pending: payments.filter(p => p.methodId === m.id && p.status === 'PENDING_CONFIRMATION').reduce((a, p) => a + (p._sum.amount ?? 0), 0),
    failed: payments.filter(p => p.methodId === m.id && (p.status === 'FAILED' || p.status === 'VOIDED')).reduce((a, p) => a + (p._sum.amount ?? 0), 0),
    refunded: refunds.filter(x => x.methodId === m.id).reduce((a, x) => a + (x._sum.amount ?? 0), 0),
    count: payments.filter(p => p.methodId === m.id).reduce((a, p) => a + p._count, 0),
  })).filter(m => m.confirmed || m.pending || m.failed || m.refunded)
  return {
    range: { from: r.from, to: r.to },
    sales: { orders: sales._count, total: sales._sum.total ?? 0, returns: sales._sum.amountReturned ?? 0, net: (sales._sum.total ?? 0) - (sales._sum.amountReturned ?? 0) },
    byMethod,
    totals: {
      confirmed: byMethod.reduce((a, m) => a + m.confirmed, 0),
      pending: byMethod.reduce((a, m) => a + m.pending, 0),
      refunded: byMethod.reduce((a, m) => a + m.refunded, 0),
    },
    outstanding: outstanding.map(o => ({ ...o, due: Number(o.due) })),
    shifts: shifts.map(s => ({ ...s, openedBy: users.find(u => u.id === s.openedById)?.name ?? '—', closedBy: users.find(u => u.id === s.closedById)?.name ?? null })),
  }
}

export async function inventoryReport(f: Partial<Range>) {
  const r = await resolveRange(f)
  const [valuation, byCategory, movements, shrink, discrepancies] = await Promise.all([
    prisma.$queryRaw<{ units: bigint | null, reserved: bigint | null, value: bigint | null, variants: bigint, missingCost: bigint }[]>`
      SELECT SUM(b."onHand") AS units, SUM(b."reserved") AS reserved, SUM(b."onHand"::bigint * COALESCE(b."avgCost", 0)) AS value, COUNT(*) AS variants,
             COUNT(*) FILTER (WHERE b."onHand" > 0 AND b."avgCost" IS NULL) AS "missingCost"
      FROM "InventoryBalance" b JOIN "ProductVariant" v ON v."id" = b."variantId" WHERE NOT v."isArchived"`,
    prisma.$queryRaw<{ category: string, units: bigint | null, value: bigint | null }[]>`
      SELECT c."name" AS category, SUM(b."onHand") AS units, SUM(b."onHand"::bigint * COALESCE(b."avgCost", 0)) AS value
      FROM "InventoryBalance" b JOIN "ProductVariant" v ON v."id" = b."variantId" JOIN "Product" p ON p."id" = v."productId" JOIN "Category" c ON c."id" = p."categoryId"
      WHERE NOT v."isArchived" GROUP BY c."name" ORDER BY value DESC NULLS LAST`,
    prisma.$queryRaw<{ type: string, moves: bigint, units: bigint | null }[]>`
      SELECT "type", COUNT(*) AS moves, SUM("qtyOnHand") AS units FROM "InventoryMovement"
      WHERE "createdAt" >= ${r.start} AND "createdAt" < ${r.end} GROUP BY "type" ORDER BY "type"`,
    prisma.inventoryMovement.findMany({
      where: { type: { in: ['DAMAGE', 'LOSS'] }, createdAt: { gte: r.start, lt: r.end } },
      include: { variant: { select: { sku: true, title: true, product: { select: { name: true } } } } }, orderBy: { createdAt: 'desc' }, take: 100,
    }),
    prisma.$queryRaw<{ number: string, name: string, finalizedAt: Date, sku: string, title: string, product: string, expected: number, counted: number }[]>`
      SELECT s."number", s."name", s."finalizedAt", v."sku", v."title", p."name" AS product, i."expectedQty" AS expected, i."countedQty" AS counted
      FROM "StocktakeItem" i JOIN "Stocktake" s ON s."id" = i."stocktakeId" JOIN "ProductVariant" v ON v."id" = i."variantId" JOIN "Product" p ON p."id" = v."productId"
      WHERE s."status" = 'FINALIZED' AND s."finalizedAt" >= ${r.start} AND s."finalizedAt" < ${r.end} AND i."countedQty" IS NOT NULL AND i."countedQty" <> i."expectedQty"
      ORDER BY s."finalizedAt" DESC LIMIT 200`,
  ])
  const v = valuation[0]!
  return {
    range: { from: r.from, to: r.to },
    valuation: { units: Number(v.units ?? 0), reserved: Number(v.reserved ?? 0), value: Number(v.value ?? 0), variants: Number(v.variants), missingCost: Number(v.missingCost) },
    byCategory: byCategory.map(c => ({ category: c.category, units: Number(c.units ?? 0), value: Number(c.value ?? 0) })),
    movements: movements.map(m => ({ type: m.type, moves: Number(m.moves), units: Number(m.units ?? 0) })),
    shrinkage: shrink,
    discrepancies,
  }
}

