import Papa from 'papaparse'
import { parseMoney } from '../../shared/money'
import type { Actor } from '../lib/actor'
import { assertCan } from '../lib/actor'
import { audit } from '../lib/audit'
import { invalid } from '../lib/errors'
import { prisma, withTx } from '../lib/prisma'
import { createProduct, effectiveAttributes, suggestSku } from './catalog'
import { createAdjustment } from './inventory'

/**
 * CSV import of products, variants and opening stock.
 * One row per variant; rows with the same category_code + product_name form one product.
 * Attribute columns are named attr_<code> (e.g. attr_color, attr_size). Money is in major units (1500.00).
 */
export const IMPORT_COLUMNS = ['category_code', 'product_name', 'description', 'brand', 'price', 'cost_price', 'status', 'sku', 'barcode', 'variant_price', 'variant_cost', 'opening_qty', 'low_stock_threshold'] as const
export const IMPORT_TEMPLATE = `${IMPORT_COLUMNS.join(',')},attr_material,attr_color
SC,Silk Square Scarf,Hand-rolled silk scarf,StyleGrab,2500.00,1100.00,ACTIVE,,,,,10,3,Silk,Black
SC,Silk Square Scarf,Hand-rolled silk scarf,StyleGrab,2500.00,1100.00,ACTIVE,,,,,6,3,Silk,Red
`
export const MAX_IMPORT_ROWS = 1000

interface ImportVariant { row: number, sku: string | null, barcode: string | null, attributes: Record<string, string>, price: number | null, costPrice: number | null, openingQty: number, lowStockThreshold: number | null }
interface ImportProduct { key: string, categoryId: string, categoryCode: string, name: string, description: string, brand: string | null, price: number, costPrice: number | null, status: 'DRAFT' | 'ACTIVE', variants: ImportVariant[] }

export interface ImportPreview {
  products: { name: string, category: string, price: number, status: string, variants: { row: number, sku: string, attributes: Record<string, string>, openingQty: number }[] }[]
  errors: { row: number, message: string }[]
  rowCount: number
}

function money(value: string | undefined, row: number, field: string, errors: ImportPreview['errors'], required = false): number | null {
  if (!value?.trim()) {
    if (required) errors.push({ row, message: `${field} is required` })
    return null
  }
  try {
    const m = parseMoney(value)
    if (m < 0) throw new Error('negative')
    return m
  }
  catch {
    errors.push({ row, message: `${field} "${value}" is not a valid amount` })
    return null
  }
}

function int(value: string | undefined, row: number, field: string, errors: ImportPreview['errors']): number | null {
  if (!value?.trim()) return null
  const n = Number(value.trim())
  if (!Number.isInteger(n) || n < 0) {
    errors.push({ row, message: `${field} must be a whole number ≥ 0` })
    return null
  }
  return n
}

async function analyse(csv: string): Promise<{ preview: ImportPreview, products: ImportProduct[] }> {
  const parsed = Papa.parse<Record<string, string>>(csv.replace(/^\uFEFF/, ''), { header: true, skipEmptyLines: 'greedy', transformHeader: h => h.trim().toLowerCase() })
  const errors: ImportPreview['errors'] = parsed.errors.map(e => ({ row: (e.row ?? 0) + 2, message: e.message }))
  const headers = parsed.meta.fields ?? []
  for (const required of ['category_code', 'product_name', 'price'] as const) {
    if (!headers.includes(required)) errors.push({ row: 1, message: `Missing required column "${required}"` })
  }
  if (parsed.data.length > MAX_IMPORT_ROWS) errors.push({ row: 1, message: `At most ${MAX_IMPORT_ROWS} rows per import` })
  if (errors.some(e => e.row === 1)) return { preview: { products: [], errors, rowCount: parsed.data.length }, products: [] }

  const categories = await prisma.category.findMany({ where: { isArchived: false } })
  const attrCache = new Map<string, Awaited<ReturnType<typeof effectiveAttributes>>>()
  const products = new Map<string, ImportProduct>()
  const fileSkus = new Map<string, number>()

  for (const [i, r] of parsed.data.entries()) {
    const row = i + 2
    const code = r.category_code?.trim().toUpperCase()
    const name = r.product_name?.trim()
    if (!code || !name) {
      errors.push({ row, message: 'category_code and product_name are required' })
      continue
    }
    const cat = categories.find(c => c.code === code)
    if (!cat) {
      errors.push({ row, message: `Unknown category code "${code}"` })
      continue
    }
    if (!attrCache.has(cat.id)) attrCache.set(cat.id, await effectiveAttributes(prisma, cat.id))
    const attrDefs = attrCache.get(cat.id)!
    const attributes: Record<string, string> = {}
    for (const h of headers.filter(h => h.startsWith('attr_'))) {
      const v = r[h]?.trim()
      if (!v) continue
      const codeKey = h.slice(5)
      const def = attrDefs.find(a => a.code === codeKey)
      if (!def) errors.push({ row, message: `Attribute "${codeKey}" does not apply to category ${code}` })
      else if (def.options.length && !def.options.includes(v)) errors.push({ row, message: `"${v}" is not an allowed ${def.name} (${def.options.join(', ')})` })
      else attributes[codeKey] = v
    }
    for (const def of attrDefs) if (def.isRequired && !attributes[def.code]) errors.push({ row, message: `${def.name} (attr_${def.code}) is required for ${code}` })

    const status = (r.status?.trim().toUpperCase() || 'DRAFT')
    if (status !== 'DRAFT' && status !== 'ACTIVE') errors.push({ row, message: 'status must be DRAFT or ACTIVE' })
    const price = money(r.price, row, 'price', errors, true)
    const sku = r.sku?.trim().toUpperCase() || null
    if (sku) {
      if (fileSkus.has(sku)) errors.push({ row, message: `SKU ${sku} also appears on row ${fileSkus.get(sku)}` })
      fileSkus.set(sku, row)
    }
    const key = `${code}|${name.toLowerCase()}`
    let product = products.get(key)
    if (!product) {
      product = { key, categoryId: cat.id, categoryCode: code, name, description: r.description?.trim() ?? '', brand: r.brand?.trim() || null, price: price ?? 0, costPrice: money(r.cost_price, row, 'cost_price', errors), status: status === 'ACTIVE' ? 'ACTIVE' : 'DRAFT', variants: [] }
      products.set(key, product)
    }
    const combo = JSON.stringify(attributes)
    if (product.variants.some(v => JSON.stringify(v.attributes) === combo)) errors.push({ row, message: `Duplicate variant of "${name}" with the same attributes` })
    product.variants.push({
      row,
      sku,
      barcode: r.barcode?.trim() || null,
      attributes,
      price: money(r.variant_price, row, 'variant_price', errors),
      costPrice: money(r.variant_cost, row, 'variant_cost', errors),
      openingQty: int(r.opening_qty, row, 'opening_qty', errors) ?? 0,
      lowStockThreshold: int(r.low_stock_threshold, row, 'low_stock_threshold', errors),
    })
  }

  const explicitSkus = [...fileSkus.keys()]
  const barcodes = [...products.values()].flatMap(p => p.variants.map(v => v.barcode)).filter((b): b is string => !!b)
  if (explicitSkus.length || barcodes.length) {
    const clashes = await prisma.productVariant.findMany({ where: { OR: [{ sku: { in: explicitSkus, mode: 'insensitive' } }, { barcode: { in: barcodes } }] }, select: { sku: true, barcode: true } })
    for (const c of clashes) {
      const row = fileSkus.get(c.sku.toUpperCase())
      errors.push({ row: row ?? 0, message: `SKU/barcode already exists in the catalogue: ${c.sku}${c.barcode ? ` / ${c.barcode}` : ''}` })
    }
  }

  const preview: ImportPreview = {
    rowCount: parsed.data.length,
    errors: errors.sort((a, b) => a.row - b.row),
    products: [...products.values()].map(p => ({
      name: p.name,
      category: p.categoryCode,
      price: p.price,
      status: p.status,
      variants: p.variants.map(v => ({ row: v.row, sku: v.sku ?? `${suggestSku(`${p.categoryCode}-###`, Object.values(v.attributes))} (auto)`, attributes: v.attributes, openingQty: v.openingQty })),
    })),
  }
  return { preview, products: [...products.values()] }
}

export async function previewImport(actor: Actor, csv: string): Promise<ImportPreview> {
  assertCan(actor, 'inventory.import')
  return (await analyse(csv)).preview
}

/** Re-validates and commits the whole file in one transaction: all products are created or none are. */
export async function commitImport(actor: Actor, csv: string) {
  assertCan(actor, 'inventory.import')
  const { preview, products } = await analyse(csv)
  if (preview.errors.length) throw invalid('import_invalid', 'Fix the errors in the file before importing', { errors: preview.errors.slice(0, 50) })
  if (!products.length) throw invalid('import_empty', 'The file contains no products')
  // Holding inventory.import is the authority to create catalogue rows and post opening stock.
  const importer: Actor = { ...actor, permissions: new Set([...actor.permissions, 'catalog.manage', 'inventory.adjust', 'inventory.adjust.approve']) }

  return withTx(async (tx) => {
    const opening: { variantId: string, qtyChange: number, unitCost: number | null }[] = []
    for (const p of products) {
      const created = await createProduct(importer, {
        name: p.name, description: p.description, categoryId: p.categoryId, brand: p.brand, price: p.price, costPrice: p.costPrice, status: p.status,
        variants: p.variants.map(v => ({ sku: v.sku, barcode: v.barcode, attributes: v.attributes, price: v.price, costPrice: v.costPrice, lowStockThreshold: v.lowStockThreshold })),
      }, tx)
      for (const [i, v] of p.variants.entries()) {
        const variant = created.variants.find(x => x.sortOrder === i)!
        if (v.openingQty > 0) opening.push({ variantId: variant.id, qtyChange: v.openingQty, unitCost: v.costPrice ?? p.costPrice })
      }
    }
    const adjustment = opening.length
      ? await createAdjustment(importer, { reason: 'OPENING_STOCK', notes: 'CSV import', items: opening }, tx)
      : null
    await audit(tx, actor, { action: 'inventory.import', entityType: 'import', after: { products: products.length, variants: products.reduce((s, p) => s + p.variants.length, 0), adjustment: adjustment?.number } })
    return { products: products.length, variants: products.reduce((s, p) => s + p.variants.length, 0), adjustmentNumber: adjustment?.number ?? null }
  }, { timeout: 300_000 })
}
