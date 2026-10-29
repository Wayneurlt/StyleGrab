import { systemActor } from '~~/server/lib/actor'
import { checkoutInput } from '~~/server/schemas'
import { createOrder } from '~~/server/services/orders'

/**
 * Guest checkout. Creates a PENDING website order and reserves stock; prices and availability are
 * revalidated server-side. Nothing is marked paid — payment is recorded later by staff.
 */
export default defineApi(async (event) => {
  rateLimit(`checkout:${clientIp(event) ?? 'unknown'}`, 20, 60 * 60_000)
  const input = await body(event, checkoutInput)
  const guestActor = { ...systemActor, permissions: new Set<string>(), label: 'guest' }
  const order = await createOrder(guestActor, {
    mode: 'web',
    idempotencyKey: input.idempotencyKey,
    lines: input.lines,
    contact: { name: input.contact.name, phone: input.contact.phone, email: input.contact.email || null, address: input.contact.address },
    fulfilmentType: input.fulfilmentType,
    customerNote: input.customerNote,
  })
  return { number: order.number, accessKey: input.idempotencyKey }
})
