import { prisma } from '~~/server/lib/prisma'
import { getSettings } from '~~/server/lib/settings'

/**
 * Customer-facing order view (shown right after checkout). Access requires the secret key returned at
 * checkout, so order numbers cannot be enumerated.
 */
export default defineApi(async (event) => {
  const number = param(event, 'number').toUpperCase()
  const key = String(getQuery(event).key ?? '')
  const order = await prisma.order.findUnique({
    where: { number },
    select: {
      number: true, status: true, paymentStatus: true, channel: true, fulfilmentType: true, placedAt: true, subtotal: true, discountTotal: true, total: true,
      amountPaid: true, amountRefunded: true, amountReturned: true, amountPending: true, contactName: true, contactPhone: true, contactEmail: true, shippingAddress: true, customerNote: true,
      idempotencyKey: true, customerId: true, reservationExpiresAt: true,
      items: { select: { productName: true, variantTitle: true, sku: true, quantity: true, unitPrice: true, lineTotal: true } },
    },
  })
  const allowed = order && key && key === order.idempotencyKey
  if (!order || !allowed) throw createError({ statusCode: 404, statusMessage: 'not_found', message: 'Order not found', data: { code: 'not_found' } })
  const methods = await prisma.paymentMethod.findMany({ where: { isActive: true, type: { in: ['MOBILE_MONEY', 'BANK_TRANSFER', 'CASH'] } }, select: { name: true, instructions: true }, orderBy: { sortOrder: 'asc' } })
  const settings = await getSettings()
  const { idempotencyKey: _k, customerId: _c, ...rest } = order
  return { ...rest, paymentMethods: methods, business: { name: settings.businessName, phone: settings.contactPhone, currency: settings.currency } }
})
