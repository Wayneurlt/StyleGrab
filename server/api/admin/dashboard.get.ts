import { rangeQuery } from '~~/server/schemas'
import { dashboard } from '~~/server/services/reports'

export default defineApi(async (event) => {
  const { actor } = await requireStaff(event, 'dashboard.view')
  const data = await dashboard(query(event, rangeQuery))
  // Valuation and cost-derived figures are sensitive.
  const financial = actor.permissions.has('*') || actor.permissions.has('reports.financial')
  const inventory = financial || actor.permissions.has('reports.inventory')
  return {
    ...data,
    months: financial ? data.months : data.months.map(m => ({ ...m, cogs: null })),
    stock: { ...data.stock, value: inventory ? data.stock.value : null },
  }
})
