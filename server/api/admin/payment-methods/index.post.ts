import { audit } from '~~/server/lib/audit'
import { withTx } from '~~/server/lib/prisma'
import { paymentMethodInput } from '~~/server/schemas'

export default defineApi(async (event) => {
  const { actor } = await requireStaff(event, 'settings.manage')
  const input = await body(event, paymentMethodInput)
  return withTx(async (tx) => {
    const m = await tx.paymentMethod.create({ data: input })
    await audit(tx, actor, { action: 'payment_method.create', entityType: 'payment_method', entityId: m.id, after: input })
    return m
  })
})
