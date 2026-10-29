import { expireStaleReservations } from '~~/server/services/orders'

export default defineApi(async (event) => {
  const { actor } = await requireStaff(event, 'orders.cancel')
  return { expired: await expireStaleReservations(actor) }
})
