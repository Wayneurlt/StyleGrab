import { z } from 'zod'
import { rangeQuery } from '~~/server/schemas'
import { inventoryReport, profitReport, reconciliationReport, salesReport } from '~~/server/services/reports'

const salesFilters = rangeQuery.extend({
  channel: z.enum(['WEBSITE', 'POS', 'WHATSAPP', 'INSTAGRAM', 'FACEBOOK', 'PHONE', 'OTHER']).optional(),
  categoryId: z.string().max(64).optional(),
  productId: z.string().max(64).optional(),
  staffId: z.string().max(64).optional(),
  methodId: z.string().max(64).optional(),
  paymentStatus: z.enum(['UNPAID', 'AWAITING_CONFIRMATION', 'PARTIALLY_PAID', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED']).optional(),
  page: z.coerce.number().int().min(1).optional(),
})

export default defineApi(async (event) => {
  const type = param(event, 'type')
  switch (type) {
    case 'sales':
      await requireStaff(event, 'reports.sales')
      return salesReport(query(event, salesFilters))
    case 'profit':
      await requireStaff(event, 'reports.financial')
      return profitReport(query(event, rangeQuery.extend({ categoryId: z.string().max(64).optional() })))
    case 'reconciliation':
      await requireStaff(event, 'reports.financial')
      return reconciliationReport(query(event, rangeQuery))
    case 'inventory':
      await requireStaff(event, 'reports.inventory')
      return inventoryReport(query(event, rangeQuery))
    default:
      throw createError({ statusCode: 404, statusMessage: 'not_found', message: 'Unknown report' })
  }
})
