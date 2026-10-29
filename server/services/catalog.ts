import type { Prisma, ProductStatus } from '@prisma/client'
import type { Actor } from '../lib/actor'
import { assertCan } from '../lib/actor'
import { audit, diff } from '../lib/audit'
import { conflict, invalid, isUniqueViolation, notFound } from '../lib/errors'
import { prisma, withTx, type Tx } from '../lib/prisma'

export function slugify(input: string): string {
  return input.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'item'
}

function skuPart(value: string): string {
  const cleaned = value.normalize('NFKD').replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  if (/^\d+$/.test(cleaned)) return cleaned.slice(0, 4)
  return cleaned.slice(0, 3) || 'X'
}

/** Suggested SKU: SG-<product code>-<attribute parts>, e.g. SG-SC-001-BLK or SG-SH-002-38. */
export function suggestSku(productCode: string, attributeValues: string[]): string {
  const parts = attributeValues.filter(Boolean).map(skuPart)
  return ['SG', productCode, ...parts].join('-').toUpperCase()
}

async function uniqueSlug(tx: Tx, base: string, model: 'product' | 'category', excludeId?: string): Promise<string> {
  const root = slugify(base)
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`
    const exists = model === 'product'
      ? await tx.product.findFirst({ where: { slug: candidate, ...(excludeId ? { id: { not: excludeId } } : {}) }, select: { id: true } })
      : await tx.category.findFirst({ where: { slug: candidate, ...(excludeId ? { id: { not: excludeId } } : {}) }, select: { id: true } })
    if (!exists) return candidate
  }
  return `${root}-${Date.now()}`
}

// ---------------------------------------------------------------------------
// Categories & attributes
// ---------------------------------------------------------------------------

export interface CategoryInput {
  name: string
  code: string
  description?: string | null
  parentId?: string | null
  isVisible?: boolean
  imageKey?: string | null
  sortOrder?: number
}

export async function createCategory(actor: Actor, input: CategoryInput) {
  assertCan(actor, 'catalog.manage')
  return withTx(async (tx) => {
    if (input.parentId && !(await tx.category.findUnique({ where: { id: input.parentId } }))) throw notFound('Parent category')
    const slug = await uniqueSlug(tx, input.name, 'category')
    try {
      const cat = await tx.category.create({
        data: { name: input.name.trim(), code: input.code.trim().toUpperCase(), slug, description: input.description ?? null, parentId: input.parentId ?? null, isVisible: input.isVisible ?? true, imageKey: input.imageKey ?? null, sortOrder: input.sortOrder ?? 0 },
      })
      await audit(tx, actor, { action: 'category.create', entityType: 'category', entityId: cat.id, after: input })
      return cat
    }
    catch (e) {
      if (isUniqueViolation(e, 'code')) throw conflict('duplicate_code', `Category code ${input.code.toUpperCase()} is already in use`)
      throw e
    }
  })
}

export async function updateCategory(actor: Actor, id: string, input: Partial<CategoryInput> & { isArchived?: boolean }) {
  assertCan(actor, 'catalog.manage')
  return withTx(async (tx) => {
    const before = await tx.category.findUnique({ where: { id } })
    if (!before) throw notFound('Category')
    if (input.parentId) {
      if (input.parentId === id) throw invalid('invalid_parent', 'A category cannot be its own parent')
      // Prevent cycles: the new parent must not be a descendant.
      const descendants = await tx.$queryRaw<{ id: string }[]>`
        WITH RECURSIVE tree AS (SELECT "id" FROM "Category" WHERE "parentId" = ${id} UNION ALL SELECT c."id" FROM "Category" c JOIN tree t ON c."parentId" = t."id")
        SELECT "id" FROM tree`
      if (descendants.some(d => d.id === input.parentId)) throw invalid('invalid_parent', 'A category cannot be moved under its own descendant')
    }
    const data: Prisma.CategoryUncheckedUpdateInput = {
      name: input.name?.trim(),
      code: input.code?.trim().toUpperCase(),
      description: input.description,
      parentId: input.parentId,
      isVisible: input.isVisible,
      imageKey: input.imageKey,
      sortOrder: input.sortOrder,
      isArchived: input.isArchived,
    }
    if (input.name && input.name !== before.name) data.slug = await uniqueSlug(tx, input.name, 'category', id)
    try {
      const cat = await tx.category.update({ where: { id }, data })
      const d = diff(before as unknown as Record<string, unknown>, data as Record<string, unknown>)
      if (d) await audit(tx, actor, { action: input.isArchived ? 'category.archive' : 'category.update', entityType: 'category', entityId: id, ...d })
      return cat
    }
    catch (e) {
      if (isUniqueViolation(e, 'code')) throw conflict('duplicate_code', 'That category code is already in use')
      throw e
    }
  })
}

export async function reorderCategories(actor: Actor, orderedIds: string[]) {
  assertCan(actor, 'catalog.manage')
  return withTx(async (tx) => {
    for (const [i, id] of orderedIds.entries()) await tx.category.update({ where: { id }, data: { sortOrder: i } })
    await audit(tx, actor, { action: 'category.reorder', entityType: 'category', after: { orderedIds } })
  })
}

export interface AttributeInput {
  id?: string
  name: string
  code: string
  options: string[]
  isRequired: boolean
}

/** Replace the attribute definitions of a category. Existing variant values are kept (historical). */
export async function setCategoryAttributes(actor: Actor, categoryId: string, attrs: AttributeInput[]) {
  assertCan(actor, 'catalog.manage')
  const codes = attrs.map(a => slugify(a.code).replace(/-/g, '_'))
  if (new Set(codes).size !== codes.length) throw invalid('duplicate_attribute', 'Attribute codes must be unique within a category')
  return withTx(async (tx) => {
    const cat = await tx.category.findUnique({ where: { id: categoryId }, include: { attributes: true } })
    if (!cat) throw notFound('Category')
    await tx.categoryAttribute.deleteMany({ where: { categoryId, code: { notIn: codes } } })
    for (const [i, a] of attrs.entries()) {
      const code = codes[i]!
      const options = [...new Set(a.options.map(o => o.trim()).filter(Boolean))]
      await tx.categoryAttribute.upsert({
        where: { categoryId_code: { categoryId, code } },
        create: { categoryId, code, name: a.name.trim(), options, isRequired: a.isRequired, sortOrder: i },
        update: { name: a.name.trim(), options, isRequired: a.isRequired, sortOrder: i },
      })
    }
    await audit(tx, actor, { action: 'category.attributes', entityType: 'category', entityId: categoryId, before: cat.attributes.map(a => ({ code: a.code, options: a.options })), after: attrs })
  })
}

/** Attributes that apply to a category: its own plus every ancestor's (nearest definition wins). */
export async function effectiveAttributes(db: Tx | typeof prisma, categoryId: string) {
  const chain = await db.$queryRaw<{ id: string, depth: number }[]>`
    WITH RECURSIVE up AS (
      SELECT "id", "parentId", 0 AS depth FROM "Category" WHERE "id" = ${categoryId}
      UNION ALL SELECT c."id", c."parentId", up.depth + 1 FROM "Category" c JOIN up ON c."id" = up."parentId"
    ) SELECT "id", depth FROM up ORDER BY depth DESC`
  const attrs = await db.categoryAttribute.findMany({ where: { categoryId: { in: chain.map(c => c.id) } }, orderBy: { sortOrder: 'asc' } })
  const byCode = new Map<string, (typeof attrs)[number]>()
  for (const c of chain) for (const a of attrs.filter(x => x.categoryId === c.id)) byCode.set(a.code, a)
  return [...byCode.values()]
}

// ---------------------------------------------------------------------------
// Products & variants
// ---------------------------------------------------------------------------

export interface VariantInput {
  id?: string
  sku?: string | null
  barcode?: string | null
  attributes: Record<string, string>
  price?: number | null
  costPrice?: number | null
  isArchived?: boolean
  lowStockThreshold?: number | null
}

export interface ProductInput {
  name: string
  description?: string
  categoryId: string
  brand?: string | null
  price: number
  costPrice?: number | null
  status?: ProductStatus
  isFeatured?: boolean
  seoTitle?: string | null
  seoDescription?: string | null
  variants: VariantInput[]
}

async function nextProductCode(tx: Tx, categoryId: string): Promise<string> {
  const cat = await tx.category.findUniqueOrThrow({ where: { id: categoryId } })
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "Counter" ("key", "value") VALUES (${`product:${cat.code}`}, 1)
    ON CONFLICT ("key") DO UPDATE SET "value" = "Counter"."value" + 1 RETURNING "value"`
  return `${cat.code}-${String(rows[0]!.value).padStart(3, '0')}`
}

function variantTitle(attrs: { name: string, code: string }[], values: Record<string, string>): string {
  const parts = attrs.map(a => values[a.code]).filter(Boolean)
  return parts.length ? parts.join(' / ') : 'Default'
}

async function validateVariantAttributes(db: Tx, categoryId: string, variants: VariantInput[]) {
  const attrs = await effectiveAttributes(db, categoryId)
  const combos = new Set<string>()
  for (const v of variants) {
    for (const key of Object.keys(v.attributes)) {
      if (!attrs.some(a => a.code === key)) throw invalid('unknown_attribute', `Attribute "${key}" does not apply to this category`)
    }
    for (const a of attrs) {
      const value = v.attributes[a.code]?.trim()
      if (!value) {
        if (a.isRequired && !v.isArchived) throw invalid('attribute_required', `${a.name} is required for every variant`)
        continue
      }
      if (a.options.length && !a.options.includes(value)) throw invalid('invalid_attribute_value', `"${value}" is not an allowed ${a.name}. Allowed: ${a.options.join(', ')}`)
    }
    const key = attrs.map(a => v.attributes[a.code]?.trim() ?? '').join('|')
    if (!v.isArchived) {
      if (combos.has(key)) throw invalid('duplicate_variant', `Two variants have the same attributes (${variantTitle(attrs, v.attributes)})`)
      combos.add(key)
    }
  }
  return attrs
}

function buildSearchText(p: { name: string, brand?: string | null, code: string }, variants: { sku: string, barcode?: string | null, attributes: Record<string, string> }[]) {
  return [p.name, p.brand ?? '', p.code, ...variants.flatMap(v => [v.sku, v.barcode ?? '', ...Object.values(v.attributes)])].join(' ').toLowerCase()
}

function validateProduct(input: ProductInput) {
  if (!input.name.trim()) throw invalid('name_required', 'Product name is required')
  if (!Number.isInteger(input.price) || input.price < 0) throw invalid('invalid_price', 'Price must be a non-negative amount')
  if (!input.variants.length) throw invalid('variant_required', 'A product needs at least one variant')
  const skus = input.variants.map(v => v.sku?.trim().toUpperCase()).filter(Boolean)
  if (new Set(skus).size !== skus.length) throw invalid('duplicate_sku', 'SKUs must be unique')
}

export async function createProduct(actor: Actor, input: ProductInput, existingTx?: Tx) {
  assertCan(actor, 'catalog.manage')
  validateProduct(input)
  const run = async (tx: Tx) => {
    if (!(await tx.category.findUnique({ where: { id: input.categoryId } }))) throw notFound('Category')
    const attrs = await validateVariantAttributes(tx, input.categoryId, input.variants)
    const code = await nextProductCode(tx, input.categoryId)
    const slug = await uniqueSlug(tx, input.name, 'product')
    const variants = input.variants.map((v, i) => ({
      ...v,
      sortOrder: i,
      sku: (v.sku?.trim() || suggestSku(code, attrs.map(a => v.attributes[a.code] ?? ''))).toUpperCase(),
      title: variantTitle(attrs, v.attributes),
    }))
    try {
      const product = await tx.product.create({
        data: {
          code,
          slug,
          name: input.name.trim(),
          description: input.description ?? '',
          categoryId: input.categoryId,
          brand: input.brand ?? null,
          price: input.price,
          costPrice: input.costPrice ?? null,
          status: input.status ?? 'DRAFT',
          publishedAt: input.status === 'ACTIVE' ? new Date() : null,
          isFeatured: input.isFeatured ?? false,
          seoTitle: input.seoTitle ?? null,
          seoDescription: input.seoDescription ?? null,
          searchText: buildSearchText({ name: input.name, brand: input.brand, code }, variants),
          createdById: actor.userId,
          updatedById: actor.userId,
          variants: {
            create: variants.map(v => ({
              sku: v.sku,
              barcode: v.barcode?.trim() || null,
              title: v.title,
              price: v.price ?? null,
              costPrice: v.costPrice ?? null,
              sortOrder: v.sortOrder,
              attributes: { create: attrs.filter(a => v.attributes[a.code]?.trim()).map(a => ({ code: a.code, name: a.name, value: v.attributes[a.code]!.trim() })) },
            })),
          },
        },
        include: { variants: true },
      })
      for (const v of product.variants) {
        const src = variants.find(x => x.sku === v.sku)
        await tx.inventoryBalance.create({ data: { variantId: v.id, lowStockThreshold: src?.lowStockThreshold ?? 3, avgCost: v.costPrice ?? input.costPrice ?? null } })
      }
      await audit(tx, actor, { action: 'product.create', entityType: 'product', entityId: product.id, after: { code, name: input.name, price: input.price, variants: variants.map(v => v.sku) } })
      return product
    }
    catch (e) {
      if (isUniqueViolation(e)) throw conflict('duplicate_sku', 'A SKU or barcode is already used by another variant')
      throw e
    }
  }
  return existingTx ? run(existingTx) : withTx(run)
}

/** Updates a product and upserts its variants. Variants are never deleted — removed ones are archived. */
export async function updateProduct(actor: Actor, id: string, input: ProductInput) {
  assertCan(actor, 'catalog.manage')
  validateProduct(input)
  return withTx(async (tx) => {
    const before = await tx.product.findUnique({ where: { id }, include: { variants: true } })
    if (!before) throw notFound('Product')

    const priceChanged = before.price !== input.price || (before.costPrice ?? null) !== (input.costPrice ?? null)
      || input.variants.some((v) => {
        const old = before.variants.find(o => o.id === v.id)
        return old ? (old.price ?? null) !== (v.price ?? null) || (old.costPrice ?? null) !== (v.costPrice ?? null) : v.price != null
      })
    if (priceChanged) assertCan(actor, 'catalog.price', 'You do not have permission to change prices or costs')

    const attrs = await validateVariantAttributes(tx, input.categoryId, input.variants)
    const slug = input.name.trim() !== before.name ? await uniqueSlug(tx, input.name, 'product', id) : before.slug
    const resolved = input.variants.map((v, i) => ({
      ...v,
      sortOrder: i,
      sku: (v.sku?.trim() || suggestSku(before.code, attrs.map(a => v.attributes[a.code] ?? ''))).toUpperCase(),
      title: variantTitle(attrs, v.attributes),
    }))

    try {
      const status = input.status ?? before.status
      await tx.product.update({
        where: { id },
        data: {
          name: input.name.trim(),
          slug,
          description: input.description ?? '',
          categoryId: input.categoryId,
          brand: input.brand ?? null,
          price: input.price,
          costPrice: input.costPrice ?? null,
          status,
          publishedAt: status === 'ACTIVE' ? before.publishedAt ?? new Date() : before.publishedAt,
          isFeatured: input.isFeatured ?? before.isFeatured,
          seoTitle: input.seoTitle ?? null,
          seoDescription: input.seoDescription ?? null,
          searchText: buildSearchText({ name: input.name, brand: input.brand, code: before.code }, resolved),
          updatedById: actor.userId,
        },
      })

      const keepIds = new Set(resolved.filter(v => v.id).map(v => v.id!))
      for (const v of before.variants) {
        if (!keepIds.has(v.id) && !v.isArchived) await tx.productVariant.update({ where: { id: v.id }, data: { isArchived: true } })
      }
      for (const v of resolved) {
        const attrRows = attrs.filter(a => v.attributes[a.code]?.trim()).map(a => ({ code: a.code, name: a.name, value: v.attributes[a.code]!.trim() }))
        const data = { sku: v.sku, barcode: v.barcode?.trim() || null, title: v.title, price: v.price ?? null, costPrice: v.costPrice ?? null, sortOrder: v.sortOrder, isArchived: v.isArchived ?? false }
        if (v.id) {
          if (!before.variants.some(o => o.id === v.id)) throw notFound('Variant')
          await tx.productVariant.update({ where: { id: v.id }, data })
          await tx.variantAttributeValue.deleteMany({ where: { variantId: v.id } })
          if (attrRows.length) await tx.variantAttributeValue.createMany({ data: attrRows.map(a => ({ ...a, variantId: v.id! })) })
          if (v.lowStockThreshold != null) await tx.inventoryBalance.update({ where: { variantId: v.id }, data: { lowStockThreshold: v.lowStockThreshold } })
        }
        else {
          const created = await tx.productVariant.create({ data: { ...data, productId: id, attributes: { create: attrRows } } })
          await tx.inventoryBalance.create({ data: { variantId: created.id, lowStockThreshold: v.lowStockThreshold ?? 3, avgCost: v.costPrice ?? input.costPrice ?? null } })
        }
      }

      await audit(tx, actor, {
        action: priceChanged ? 'product.price_change' : 'product.update',
        entityType: 'product',
        entityId: id,
        before: { name: before.name, price: before.price, costPrice: before.costPrice, status: before.status, variants: before.variants.map(v => ({ sku: v.sku, price: v.price, costPrice: v.costPrice, archived: v.isArchived })) },
        after: { name: input.name, price: input.price, costPrice: input.costPrice, status, variants: resolved.map(v => ({ sku: v.sku, price: v.price, costPrice: v.costPrice, archived: v.isArchived ?? false })) },
      })
      return tx.product.findUniqueOrThrow({ where: { id }, include: { variants: true } })
    }
    catch (e) {
      if (isUniqueViolation(e)) throw conflict('duplicate_sku', 'A SKU or barcode is already used by another variant')
      throw e
    }
  })
}

export async function setProductStatus(actor: Actor, id: string, status: ProductStatus) {
  assertCan(actor, 'catalog.manage')
  return withTx(async (tx) => {
    const before = await tx.product.findUnique({ where: { id } })
    if (!before) throw notFound('Product')
    await tx.product.update({ where: { id }, data: { status, publishedAt: status === 'ACTIVE' ? before.publishedAt ?? new Date() : before.publishedAt, updatedById: actor.userId } })
    await audit(tx, actor, { action: `product.${status.toLowerCase()}`, entityType: 'product', entityId: id, before: { status: before.status }, after: { status } })
  })
}

export async function isSkuAvailable(sku: string, excludeVariantId?: string): Promise<boolean> {
  const found = await prisma.productVariant.findFirst({ where: { sku: { equals: sku.trim(), mode: 'insensitive' }, ...(excludeVariantId ? { id: { not: excludeVariantId } } : {}) }, select: { id: true } })
  return !found
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

export async function addProductImage(actor: Actor, productId: string, image: { key: string, mimeType: string, sizeBytes: number, alt?: string }) {
  assertCan(actor, 'catalog.manage')
  return withTx(async (tx) => {
    const product = await tx.product.findUnique({ where: { id: productId }, include: { images: true } })
    if (!product) throw notFound('Product')
    if (product.images.length >= 12) throw invalid('too_many_images', 'A product can have at most 12 images')
    const img = await tx.productImage.create({
      data: { productId, key: image.key, mimeType: image.mimeType, sizeBytes: image.sizeBytes, alt: image.alt ?? product.name, sortOrder: product.images.length, isPrimary: product.images.length === 0 },
    })
    await audit(tx, actor, { action: 'product.image.add', entityType: 'product', entityId: productId, after: { key: image.key } })
    return img
  })
}

export async function updateProductImages(actor: Actor, productId: string, input: { order: string[], primaryId?: string, alts?: Record<string, string> }) {
  assertCan(actor, 'catalog.manage')
  return withTx(async (tx) => {
    const images = await tx.productImage.findMany({ where: { productId } })
    const ids = new Set(images.map(i => i.id))
    if (input.order.some(id => !ids.has(id))) throw notFound('Image')
    for (const [i, id] of input.order.entries()) {
      await tx.productImage.update({ where: { id }, data: { sortOrder: i, isPrimary: input.primaryId ? id === input.primaryId : undefined, alt: input.alts?.[id] } })
    }
    await audit(tx, actor, { action: 'product.image.update', entityType: 'product', entityId: productId, after: input })
  })
}

/** Removes the DB row; returns the storage key so the caller can delete the object. */
export async function removeProductImage(actor: Actor, productId: string, imageId: string): Promise<string> {
  assertCan(actor, 'catalog.manage')
  return withTx(async (tx) => {
    const img = await tx.productImage.findFirst({ where: { id: imageId, productId } })
    if (!img) throw notFound('Image')
    await tx.productImage.delete({ where: { id: imageId } })
    if (img.isPrimary) {
      const next = await tx.productImage.findFirst({ where: { productId }, orderBy: { sortOrder: 'asc' } })
      if (next) await tx.productImage.update({ where: { id: next.id }, data: { isPrimary: true } })
    }
    await audit(tx, actor, { action: 'product.image.remove', entityType: 'product', entityId: productId, before: { key: img.key } })
    return img.key
  })
}

// ---------------------------------------------------------------------------
// Admin listing / search
// ---------------------------------------------------------------------------

export async function listProductsAdmin(params: { q?: string, categoryId?: string, status?: ProductStatus, stock?: 'in' | 'out' | 'low', page: number, pageSize: number }) {
  const where: Prisma.ProductWhereInput = {}
  if (params.q) where.searchText = { contains: params.q.trim().toLowerCase() }
  if (params.categoryId) where.categoryId = params.categoryId
  if (params.status) where.status = params.status
  else where.status = { not: 'ARCHIVED' }
  if (params.stock) {
    const sql = params.stock === 'out'
      ? `SELECT v."productId" FROM "ProductVariant" v JOIN "InventoryBalance" b ON b."variantId" = v."id" WHERE NOT v."isArchived" GROUP BY v."productId" HAVING SUM(b."onHand" - b."reserved") <= 0`
      : params.stock === 'low'
        ? `SELECT DISTINCT v."productId" FROM "ProductVariant" v JOIN "InventoryBalance" b ON b."variantId" = v."id" WHERE NOT v."isArchived" AND b."onHand" - b."reserved" <= b."lowStockThreshold"`
        : `SELECT DISTINCT v."productId" FROM "ProductVariant" v JOIN "InventoryBalance" b ON b."variantId" = v."id" WHERE NOT v."isArchived" AND b."onHand" - b."reserved" > 0`
    const ids = await prisma.$queryRawUnsafe<{ productId: string }[]>(sql)
    where.id = { in: ids.map(r => r.productId) }
  }
  const [total, items] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      include: {
        category: { select: { name: true } },
        images: { where: { isPrimary: true }, take: 1 },
        variants: { where: { isArchived: false }, select: { id: true, sku: true, price: true, inventory: { select: { onHand: true, reserved: true } } } },
      },
      orderBy: { updatedAt: 'desc' },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
  ])
  return {
    total,
    items: items.map(p => ({
      id: p.id,
      code: p.code,
      name: p.name,
      slug: p.slug,
      status: p.status,
      isFeatured: p.isFeatured,
      category: p.category.name,
      price: p.price,
      imageKey: p.images[0]?.key ?? null,
      variantCount: p.variants.length,
      available: p.variants.reduce((s, v) => s + (v.inventory ? v.inventory.onHand - v.inventory.reserved : 0), 0),
      onHand: p.variants.reduce((s, v) => s + (v.inventory?.onHand ?? 0), 0),
      updatedAt: p.updatedAt,
    })),
  }
}

export async function getProductAdmin(id: string) {
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      category: true,
      images: { orderBy: { sortOrder: 'asc' } },
      variants: { orderBy: { sortOrder: 'asc' }, include: { attributes: true, inventory: true } },
    },
  })
  if (!product) throw notFound('Product')
  return { ...product, attributeDefs: await effectiveAttributes(prisma, product.categoryId) }
}

/** Search sellable variants for POS / manual orders. Matches SKU, barcode (exact), product name, attributes. */
export async function searchSellableVariants(params: { q?: string, categoryId?: string, limit: number, includeDraft?: boolean }) {
  const q = params.q?.trim()
  const where: Prisma.ProductVariantWhereInput = {
    isArchived: false,
    product: { status: params.includeDraft ? { not: 'ARCHIVED' } : 'ACTIVE', ...(params.categoryId ? { categoryId: params.categoryId } : {}) },
  }
  if (q) {
    where.OR = [
      { sku: { equals: q, mode: 'insensitive' } },
      { barcode: q },
      { sku: { contains: q, mode: 'insensitive' } },
      { title: { contains: q, mode: 'insensitive' } },
      { product: { searchText: { contains: q.toLowerCase() } } },
    ]
  }
  const rows = await prisma.productVariant.findMany({
    where,
    include: { inventory: true, product: { select: { id: true, name: true, price: true, images: { where: { isPrimary: true }, take: 1, select: { key: true } } } } },
    orderBy: [{ product: { name: 'asc' } }, { sortOrder: 'asc' }],
    take: params.limit,
  })
  return rows.map(v => ({
    variantId: v.id,
    productId: v.product.id,
    productName: v.product.name,
    title: v.title,
    sku: v.sku,
    barcode: v.barcode,
    price: v.price ?? v.product.price,
    available: v.inventory ? v.inventory.onHand - v.inventory.reserved : 0,
    imageKey: v.product.images[0]?.key ?? null,
    exactMatch: !!q && (v.sku.toLowerCase() === q.toLowerCase() || v.barcode === q),
  }))
}

