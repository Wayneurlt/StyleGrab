import { audit } from '~~/server/lib/audit'
import { withTx } from '~~/server/lib/prisma'
import { paymentMethodInput } from '~~/server/schemas'

export default defineApi(async (event) => {
  const { actor } = await requireStaff(event, 'settings.manage')
  const input = await body(event, paymentMethodInput.omit({ code: true }))
  const id = param(event, 'id')
  return withTx(async (tx) => {
    const before = await tx.paymentMethod.findUnique({ where: { id } })
    if (!before) throw createError({ statusCode: 404, statusMessage: 'not_found', message: 'Payment method not found' })
    if (before.isSystem) throw createError({ statusCode: 409, statusMessage: 'system_method', message: 'System payment methods cannot be edited' })
    const m = await tx.paymentMethod.update({ where: { id }, data: input })
    await audit(tx, actor, { action: 'payment_method.update', entityType: 'payment_method', entityId: id, before, after: input })
    return m
  })
})
