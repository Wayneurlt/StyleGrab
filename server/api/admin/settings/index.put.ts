import { audit } from '~~/server/lib/audit'
import { withTx } from '~~/server/lib/prisma'
import { getSettings, saveSettings } from '~~/server/lib/settings'
import { settingsInput } from '~~/server/schemas'

export default defineApi(async (event) => {
  const { actor } = await requireStaff(event, 'settings.manage')
  const input = await body(event, settingsInput)
  return withTx(async (tx) => {
    const before = await getSettings(tx)
    await saveSettings(tx, input)
    await audit(tx, actor, { action: 'settings.update', entityType: 'settings', before, after: input })
    return input
  })
})
