import { z } from 'zod'
import { validateCart } from '~~/server/services/storefront'

export default defineApi(async (event) => {
  const input = await body(event, z.object({ lines: z.array(z.object({ variantId: z.string().max(64), quantity: z.number().int().min(1).max(20) })).max(50) }))
  return validateCart(input.lines)
})
