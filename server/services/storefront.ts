import type { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { getSettings } from '../lib/settings'
import { notFound } from '../lib/errors'

/** Public catalogue queries. Only ACTIVE products in visible, non-archived categories are exposed. */

const publicProductWhere = (): Prisma.ProductWhereInput => ({ status: 'ACTIVE', category: { isVisible: true, isArchived: false } })

const cardSelect = {
  id: true, name: true, slug: true, price: true, brand: true, isFeatured: true, createdAt: true,
  category: { select: { name: true, slug: true } },
  images: { orderBy: { sortOrder: 'asc' }, take: 2, select: { key: true, alt: true } },
  variants: { where: { isArchived: false }, select: { id: true, price: true, inventory: { select: { onHand: true, reserved: true } } } },
} satisfies Prisma.ProductSelect

type CardRow = Prisma.ProductGetPayload<{ select: typeof cardSelect }>

function toCard(p: CardRow) {
  const prices = p.variants.map(v => v.price ?? p.price)
  const available = p.variants.reduce((s, v) => s + Math.max(0, (v.inventory?.onHand ?? 0) - (v.inventory?.reserved ?? 0)), 0)
  return {
    id: p.id, name: p.name, slug: p.slug, brand: p.brand, category: p.category,
    priceFrom: prices.length ? Math.min(...prices) : p.price,
    priceTo: prices.length ? Math.max(...prices) : p.price,
    images: p.images,
    inStock: available > 0,
    lowStock: available > 0 && available <= 3,
    isNew: Date.now() - p.createdAt.getTime() < 30 * 86_400_000,
  }
}

export async function storeCategories() {
  const cats = await prisma.category.findMany({
    where: { isVisible: true, isArchived: false },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, slug: true, description: true, imageKey: true, parentId: true },
  })
  // Active products per category including all visible subcategories (a "Scarves" tile counts silk + cotton scarves).
  const counts = await prisma.$queryRaw<{ id: string, n: bigint }[]>`
    WITH RECURSIVE tree AS (
      SELECT "id" AS root, "id" FROM "Category" WHERE "isVisible" AND NOT "isArchived"
      UNION ALL SELECT t.root, c."id" FROM "Category" c JOIN tree t ON c."parentId" = t."id" WHERE c."isVisible" AND NOT c."isArchived"
    )
    SELECT t.root AS id, COUNT(p."id") AS n FROM tree t LEFT JOIN "Product" p ON p."categoryId" = t."id" AND p."status" = 'ACTIVE'
    GROUP BY t.root`
  return cats.map(c => ({ ...c, productCount: Number(counts.find(x => x.id === c.id)?.n ?? 0) }))
}

async function subtreeIds(slug: string) {
  const root = await prisma.category.findFirst({ where: { slug, isVisible: true, isArchived: false } })
  if (!root) throw notFound('Category')
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    WITH RECURSIVE tree AS (SELECT "id" FROM "Category" WHERE "id" = ${root.id}
      UNION ALL SELECT c."id" FROM "Category" c JOIN tree t ON c."parentId" = t."id" WHERE c."isVisible" AND NOT c."isArchived")
    SELECT "id" FROM tree`
  return { root, ids: rows.map(r => r.id) }
}

export interface StoreQuery {
  q?: string
  category?: string
  sort?: 'newest' | 'price_asc' | 'price_desc' | 'name'
  min?: number
  max?: number
  inStock?: boolean
  attrs?: Record<string, string[]>
  page: number
  pageSize: number
}

export async function storeProducts(f: StoreQuery) {
  const where: Prisma.ProductWhereInput = publicProductWhere()
  const and: Prisma.ProductWhereInput[] = []
  let category: { name: string, slug: string, description: string | null } | null = null
  if (f.category) {
    const { root, ids } = await subtreeIds(f.category)
    category = { name: root.name, slug: root.slug, description: root.description }
    and.push({ categoryId: { in: ids } })
  }
  if (f.q) and.push({ searchText: { contains: f.q.trim().toLowerCase() } })
  if (f.min != null) and.push({ price: { gte: f.min } })
  if (f.max != null) and.push({ price: { lte: f.max } })
  for (const [code, values] of Object.entries(f.attrs ?? {})) {
    if (values.length) and.push({ variants: { some: { isArchived: false, attributes: { some: { code, value: { in: values } } } } } })
  }
  if (f.inStock) {
    const ids = await prisma.$queryRaw<{ productId: string }[]>`
      SELECT DISTINCT v."productId" FROM "ProductVariant" v JOIN "InventoryBalance" b ON b."variantId" = v."id"
      WHERE NOT v."isArchived" AND b."onHand" - b."reserved" > 0`
    and.push({ id: { in: ids.map(r => r.productId) } })
  }
  if (and.length) where.AND = and

  const orderBy: Prisma.ProductOrderByWithRelationInput[] = f.sort === 'price_asc'
    ? [{ price: 'asc' }]
    : f.sort === 'price_desc' ? [{ price: 'desc' }] : f.sort === 'name' ? [{ name: 'asc' }] : [{ publishedAt: 'desc' }, { createdAt: 'desc' }]

  const [total, rows] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({ where, select: cardSelect, orderBy, skip: (f.page - 1) * f.pageSize, take: f.pageSize }),
  ])

  // Facets: attribute values present among matching products (bounded).
  const facetRows = await prisma.variantAttributeValue.findMany({
    where: { variant: { isArchived: false, product: { ...publicProductWhere(), ...(category ? { AND: and.slice(0, 1) } : {}) } } },
    distinct: ['code', 'value'],
    select: { code: true, name: true, value: true },
    take: 300,
  })
  const facets: Record<string, { name: string, values: string[] }> = {}
  for (const r of facetRows) {
    facets[r.code] ??= { name: r.name, values: [] }
    facets[r.code]!.values.push(r.value)
  }
  for (const f2 of Object.values(facets)) f2.values.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

  return { total, page: f.page, pageSize: f.pageSize, category, items: rows.map(toCard), facets }
}

export async function storeHome() {
  const [featured, newest, best, categories] = await Promise.all([
    prisma.product.findMany({ where: { ...publicProductWhere(), isFeatured: true }, select: cardSelect, orderBy: { updatedAt: 'desc' }, take: 8 }),
    prisma.product.findMany({ where: publicProductWhere(), select: cardSelect, orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }], take: 8 }),
    prisma.$queryRaw<{ productId: string }[]>`
      SELECT i."productId" FROM "OrderItem" i JOIN "Order" o ON o."id" = i."orderId"
      WHERE o."status" = 'COMPLETED' AND o."completedAt" > now() - interval '90 days'
      GROUP BY i."productId" ORDER BY SUM(i."quantity" - i."returnedQty") DESC LIMIT 8`,
    storeCategories(),
  ])
  const bestRows = best.length ? await prisma.product.findMany({ where: { ...publicProductWhere(), id: { in: best.map(b => b.productId) } }, select: cardSelect }) : []
  const settings = await getSettings()
  return {
    business: { name: settings.businessName, phone: settings.contactPhone, email: settings.contactEmail, address: settings.address, returnPolicy: settings.returnPolicy, currency: settings.currency },
    featured: featured.map(toCard),
    newArrivals: newest.map(toCard),
    // Only shown when there are real recorded sales.
    bestSellers: best.map(b => bestRows.find(r => r.id === b.productId)).filter((x): x is CardRow => !!x).map(toCard),
    categories: categories.filter(c => !c.parentId),
  }
}

export async function storeProduct(slug: string) {
  const p = await prisma.product.findFirst({
    where: { ...publicProductWhere(), slug },
    include: {
      category: { select: { id: true, name: true, slug: true, parent: { select: { name: true, slug: true } } } },
      images: { orderBy: { sortOrder: 'asc' }, select: { key: true, alt: true, isPrimary: true } },
      variants: { where: { isArchived: false }, orderBy: { sortOrder: 'asc' }, include: { attributes: true, inventory: true } },
    },
  })
  if (!p) throw notFound('Product')
  const attrNames = new Map<string, string>()
  for (const v of p.variants) for (const a of v.attributes) attrNames.set(a.code, a.name)
  const related = await prisma.product.findMany({ where: { ...publicProductWhere(), categoryId: p.categoryId, id: { not: p.id } }, select: cardSelect, take: 4, orderBy: { updatedAt: 'desc' } })
  return {
    id: p.id, name: p.name, slug: p.slug, description: p.description, brand: p.brand, price: p.price,
    seoTitle: p.seoTitle, seoDescription: p.seoDescription, category: p.category, images: p.images,
    attributes: [...attrNames].map(([code, name]) => ({ code, name, values: [...new Set(p.variants.map(v => v.attributes.find(a => a.code === code)?.value).filter((x): x is string => !!x))] })),
    variants: p.variants.map(v => ({
      id: v.id, sku: v.sku, title: v.title, price: v.price ?? p.price,
      attributes: Object.fromEntries(v.attributes.map(a => [a.code, a.value])),
      available: Math.max(0, (v.inventory?.onHand ?? 0) - (v.inventory?.reserved ?? 0)),
    })),
    related: related.map(toCard),
  }
}

/** Revalidate a cart against current prices and availability. Never trusts client prices. */
export async function validateCart(lines: { variantId: string, quantity: number }[]) {
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: lines.map(l => l.variantId) } },
    include: { inventory: true, product: { select: { name: true, slug: true, price: true, status: true, images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { key: true } } } } },
  })
  const items = lines.map((l) => {
    const v = variants.find(x => x.id === l.variantId)
    if (!v || v.isArchived || v.product.status !== 'ACTIVE') return { variantId: l.variantId, quantity: l.quantity, status: 'unavailable' as const, message: 'No longer available' }
    const available = Math.max(0, (v.inventory?.onHand ?? 0) - (v.inventory?.reserved ?? 0))
    const unitPrice = v.price ?? v.product.price
    const quantity = Math.min(l.quantity, available)
    return {
      variantId: v.id, productName: v.product.name, slug: v.product.slug, variantTitle: v.title, sku: v.sku, imageKey: v.product.images[0]?.key ?? null,
      unitPrice, quantity: l.quantity, available, lineTotal: unitPrice * l.quantity,
      status: available === 0 ? 'out_of_stock' as const : quantity < l.quantity ? 'insufficient' as const : 'ok' as const,
      message: available === 0 ? 'Out of stock' : quantity < l.quantity ? `Only ${available} available` : null,
    }
  })
  const ok = items.every(i => i.status === 'ok')
  const subtotal = items.reduce((s, i) => s + ('lineTotal' in i && i.status === 'ok' ? i.lineTotal : 0), 0)
  return { items, ok, subtotal }
}
