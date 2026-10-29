import { getSettings } from '~~/server/lib/settings'

/** Public business details for the storefront header/footer. Only fields meant for customers. */
export default defineApi(async () => {
  const s = await getSettings()
  return { name: s.businessName, phone: s.contactPhone, email: s.contactEmail, address: s.address, returnPolicy: s.returnPolicy, currency: s.currency }
})
