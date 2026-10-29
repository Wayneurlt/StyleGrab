import { cancelStocktake, finalizeStocktake, submitStocktake } from '~~/server/services/inventory'

export default defineApi(async (event) => {
  const action = param(event, 'action')
  const id = param(event, 'id')
  if (action === 'submit') {
    const { actor } = await requireStaff(event, 'inventory.stocktake')
    await submitStocktake(actor, id)
    return { ok: true }
  }
  if (action === 'finalize') {
    const { actor } = await requireStaff(event, 'inventory.stocktake.finalize')
    return finalizeStocktake(actor, id)
  }
  if (action === 'cancel') {
    const { actor } = await requireStaff(event, 'inventory.stocktake')
    await cancelStocktake(actor, id)
    return { ok: true }
  }
  throw createError({ statusCode: 404, statusMessage: 'not_found', message: 'Unknown action' })
})
