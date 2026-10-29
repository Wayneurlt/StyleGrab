import { z } from 'zod'
import { storeProducts } from '~~/server/services/storefront'

export default defineApi(async (event) => {
  const raw = getQuery(event)
  const q = z.object({
    q: z.string().trim().max(100).optional(),
    category: z.string().trim().max(100).optional(),
    sort: z.enum(['newest', 'price_asc', 'price_desc', 'name']).optional(),
    min: z.coerce.number().int().min(0).optional(),
    max: z.coerce.number().int().min(0).optional(),
    inStock: z.enum(['1', 'true']).optional(),
    page: z.coerce.number().int().min(1).max(500).optional(),
  }).parse(raw)
  // Attribute filters arrive as attr_<code>=v1,v2
  const attrs: Record<string, string[]> = {}
  for (const [k, v] of Object.entries(raw)) {
    if (k.startsWith('attr_') && typeof v === 'string' && /^[a-z0-9_]{1,30}$/.test(k.slice(5))) attrs[k.slice(5)] = v.split(',').map(s => s.trim()).filter(Boolean).slice(0, 20)
  }
  return storeProducts({ ...q, inStock: !!q.inStock, attrs, page: q.page ?? 1, pageSize: 12 })
})
