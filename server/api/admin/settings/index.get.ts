import { getSettings } from '~~/server/lib/settings'

/** Any signed-in staff member can read settings (currency, timezone, receipt text, discount limits). */
export default defineApi(async (event) => {
  await requireStaff(event)
  return getSettings()
})
