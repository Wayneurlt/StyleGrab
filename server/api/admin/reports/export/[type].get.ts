import Papa from 'papaparse'
import { z } from 'zod'
import { toMajorString } from '~~/shared/money'
import { prisma } from '~~/server/lib/prisma'
import { rangeQuery } from '~~/server/schemas'
import { listStock } from '~~/server/services/inventory'
import { inventoryReport, profitReport, reconciliationReport, resolveRange, salesReport } from '~~/server/services/reports'

/** CSV exports. Each applies the same permission and filters as the on-screen report. Money is in major units. */
export default defineApi(async (event) => {
  const type = param(event, 'type')
  const m = toMajorString
  let rows: Record<string, string | number | null>[]
  const q = getQuery(event)

  if (type === 'sales') {
    await requireStaff(event, 'reports.sales')
    const f = rangeQuery.extend({
      channel: z.enum(['WEBSITE', 'POS', 'WHATSAPP', 'INSTAGRAM', 'FACEBOOK', 'PHONE', 'OTHER']).optional(),
      categoryId: z.string().max(64).optional(), productId: z.string().max(64).optional(), staffId: z.string().max(64).optional(), methodId: z.string().max(64).optional(),
      paymentStatus: z.enum(['UNPAID', 'AWAITING_CONFIRMATION', 'PARTIALLY_PAID', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED']).optional(),
    }).parse(q)
    const r = await salesReport({ ...f, page: 1, pageSize: 5000 })
    rows = r.orders.map(o => ({ order: o.number, completed_at: o.completedAt?.toISOString() ?? '', channel: o.channel, customer: o.customerName, staff: o.staff, items: o.itemCount, subtotal: m(o.subtotal), discount: m(o.discountTotal), total: m(o.total), returned: m(o.amountReturned), net_paid: m(o.amountPaid - o.amountRefunded), payment_status: o.paymentStatus }))
  }
  else if (type === 'profit') {
    await requireStaff(event, 'reports.financial')
    const r = await profitReport(rangeQuery.parse(q))
    rows = r.categories.map(c => ({ category: c.category, units: c.units, revenue: m(c.revenue), costed_revenue: m(c.costedRevenue), cogs: m(c.cogs), gross_profit: m(c.grossProfit), margin_pct: c.margin == null ? '' : (c.margin * 100).toFixed(1), uncosted_lines: c.uncostedLines }))
  }
  else if (type === 'reconciliation') {
    await requireStaff(event, 'reports.financial')
    const r = await reconciliationReport(rangeQuery.parse(q))
    rows = r.byMethod.map(x => ({ method: x.name, confirmed: m(x.confirmed), awaiting_confirmation: m(x.pending), failed_or_voided: m(x.failed), refunded: m(x.refunded), records: x.count }))
  }
  else if (type === 'stock') {
    await requireStaff(event, 'reports.inventory')
    const r = await listStock({ page: 1, pageSize: 20000, filter: (['low', 'out', 'in'].includes(String(q.filter)) ? q.filter : 'all') as 'all' })
    rows = r.items.map(i => ({ sku: i.sku, product: i.productName, variant: i.title, category: i.category, on_hand: i.onHand, reserved: i.reserved, available: i.available, low_stock_threshold: i.lowStockThreshold, avg_cost: m(i.avgCost), value: i.avgCost == null ? '' : m(i.avgCost * i.onHand) }))
  }
  else if (type === 'movements') {
    await requireStaff(event, 'reports.inventory')
    const range = await resolveRange(rangeQuery.parse(q))
    const moves = await prisma.inventoryMovement.findMany({ where: { createdAt: { gte: range.start, lt: range.end } }, orderBy: { createdAt: 'asc' }, take: 20000, include: { variant: { select: { sku: true, product: { select: { name: true } } } } } })
    rows = moves.map(x => ({ at: x.createdAt.toISOString(), type: x.type, sku: x.variant.sku, product: x.variant.product.name, on_hand_change: x.qtyOnHand, reserved_change: x.qtyReserved, on_hand_after: x.onHandAfter, reserved_after: x.reservedAfter, unit_cost: m(x.unitCost), reference: x.referenceLabel ?? '', reason: x.reason ?? '', notes: x.notes ?? '' }))
  }
  else if (type === 'inventory') {
    await requireStaff(event, 'reports.inventory')
    const r = await inventoryReport(rangeQuery.parse(q))
    rows = r.byCategory.map(c => ({ category: c.category, units: c.units, value: m(c.value) }))
  }
  else {
    throw createError({ statusCode: 404, statusMessage: 'not_found', message: 'Unknown export' })
  }

  const csv = Papa.unparse(rows.length ? rows : [{ note: 'No records for the selected filters' }], { escapeFormulae: true })
  setResponseHeaders(event, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="stylegrab-${type}-${new Date().toISOString().slice(0, 10)}.csv"` })
  return `\uFEFF${csv}`
})
