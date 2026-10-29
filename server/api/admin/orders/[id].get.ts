import { getSettings } from '~~/server/lib/settings'
import { getOrderDetail } from '~~/server/services/orders'
import { outstandingBalance } from '~~/server/services/payments'

export default defineApi(async (event) => {
  await requireStaff(event, 'orders.view')
  const order = await getOrderDetail(param(event, 'id'))
  const settings = await getSettings()
  return {
    ...order,
    balance: order.status === 'CANCELLED' ? 0 : outstandingBalance(order),
    refundable: Math.max(0, (order.amountPaid - order.amountRefunded) - (order.total - order.amountReturned)),
    business: { name: settings.businessName, phone: settings.contactPhone, email: settings.contactEmail, address: settings.address, receiptFooter: settings.receiptFooter, returnPolicy: settings.returnPolicy, currency: settings.currency, timezone: settings.timezone },
  }
})
