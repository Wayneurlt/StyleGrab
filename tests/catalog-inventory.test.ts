import { beforeAll, describe, expect, it } from 'vitest'
import { createProduct, setCategoryAttributes, setProductStatus, updateProduct } from '../server/services/catalog'
import { applyMovement, createAdjustment, decideAdjustment, finalizeStocktake, receiveGoods, recordCounts, startStocktake, submitStocktake } from '../server/services/inventory'
import { createPurchaseOrder, createSupplier, setPurchaseOrderStatus } from '../server/services/purchasing'
import { commitImport, previewImport } from '../server/services/importer'
import { actors, balance, key, prisma, resetDb, shoe } from './helpers'

let A: Awaited<ReturnType<typeof actors>>

beforeAll(async () => {
  await resetDb()
  A = await actors()
})

describe('catalogue', () => {
  it('creates a product with variants, SKUs and inventory rows', async () => {
    const p = await shoe(A.manager, { sizes: ['38', '39', '40'] })
    expect(p.variants).toHaveLength(3)
    expect(p.code).toMatch(/^SH-\d{3}$/)
    expect(p.variants.map(v => v.sku)).toEqual([`SG-${p.code}-WHI-38`, `SG-${p.code}-WHI-39`, `SG-${p.code}-WHI-40`])
    for (const v of p.variants) expect((await balance(v.id)).onHand).toBe(0)
  })

  it('rejects duplicate SKUs (including case-insensitive) at the database', async () => {
    const cat = await prisma.category.findUniqueOrThrow({ where: { code: 'BT' } })
    await createProduct(A.manager, { name: 'Belt A', categoryId: cat.id, price: 1000, variants: [{ sku: 'DUP-SKU-1', attributes: { material: 'Leather', color: 'Black', size: 'M' } }] })
    await expect(createProduct(A.manager, { name: 'Belt B', categoryId: cat.id, price: 1000, variants: [{ sku: 'dup-sku-1', attributes: { material: 'Leather', color: 'Brown', size: 'M' } }] }))
      .rejects.toMatchObject({ code: 'duplicate_sku' })
  })

  it('enforces category-specific attributes', async () => {
    const scarves = await prisma.category.findUniqueOrThrow({ where: { code: 'SC' } })
    // Shoe size does not apply to scarves.
    await expect(createProduct(A.manager, { name: 'Bad scarf', categoryId: scarves.id, price: 1000, variants: [{ attributes: { material: 'Silk', color: 'Red', shoe_size: '38' } }] }))
      .rejects.toMatchObject({ code: 'unknown_attribute' })
    // Material must be one of the configured options.
    await expect(createProduct(A.manager, { name: 'Bad scarf', categoryId: scarves.id, price: 1000, variants: [{ attributes: { material: 'Wool', color: 'Red' } }] }))
      .rejects.toMatchObject({ code: 'invalid_attribute_value' })
    // Child categories inherit parent attributes.
    const silk = await prisma.category.findUniqueOrThrow({ where: { code: 'SCS' } })
    const ok = await createProduct(A.manager, { name: 'Good scarf', categoryId: silk.id, price: 1000, variants: [{ attributes: { material: 'Silk', color: 'Red' } }] })
    expect(ok.variants[0]!.title).toBe('Silk / Red')
  })

  it('lets admins configure attributes per category', async () => {
    const belts = await prisma.category.findUniqueOrThrow({ where: { code: 'BT' } })
    await setCategoryAttributes(A.manager, belts.id, [
      { name: 'Material', code: 'material', options: ['Leather', 'Fabric'], isRequired: true },
      { name: 'Colour', code: 'color', options: [], isRequired: true },
      { name: 'Size', code: 'size', options: ['S', 'M', 'L'], isRequired: true },
    ])
    await expect(createProduct(A.manager, { name: 'Chain belt', categoryId: belts.id, price: 1000, variants: [{ attributes: { material: 'Chain', color: 'Gold', size: 'M' } }] }))
      .rejects.toMatchObject({ code: 'invalid_attribute_value' })
  })

  it('archives products and variants instead of deleting history', async () => {
    const p = await shoe(A.manager, { sizes: ['41', '42'] })
    const full = await prisma.product.findUniqueOrThrow({ where: { id: p.id }, include: { variants: { include: { attributes: true } } } })
    // Remove size 42 from the edit payload -> archived, not deleted.
    await updateProduct(A.manager, p.id, {
      name: full.name, categoryId: full.categoryId, price: full.price, costPrice: full.costPrice, status: 'ACTIVE',
      variants: [{ id: full.variants[0]!.id, sku: full.variants[0]!.sku, attributes: { color: 'White', size: '41' } }],
    })
    const v42 = await prisma.productVariant.findUniqueOrThrow({ where: { id: full.variants[1]!.id } })
    expect(v42.isArchived).toBe(true)
    await setProductStatus(A.manager, p.id, 'ARCHIVED')
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).status).toBe('ARCHIVED')
  })

  it('requires catalog.price to change prices', async () => {
    const p = await shoe(A.manager)
    const full = await prisma.product.findUniqueOrThrow({ where: { id: p.id }, include: { variants: true } })
    const payload = { name: full.name, categoryId: full.categoryId, price: 1, costPrice: full.costPrice, variants: full.variants.map(v => ({ id: v.id, sku: v.sku, attributes: { color: 'White', size: v.title.split(' / ')[1]! } })) }
    const noPrice = { ...A.manager, permissions: new Set([...A.manager.permissions].filter(x => x !== 'catalog.price')) }
    await expect(updateProduct(noPrice, p.id, payload)).rejects.toMatchObject({ code: 'forbidden' })
  })
})

describe('inventory', () => {
  it('records opening stock with weighted average cost', async () => {
    const p = await shoe(A.manager, { qty: 10 })
    const b = await balance(p.variants[0]!.id)
    expect(b.onHand).toBe(10)
    expect(b.avgCost).toBe(200000)
    const moves = await prisma.inventoryMovement.findMany({ where: { variantId: p.variants[0]!.id } })
    expect(moves).toHaveLength(1)
    expect(moves[0]!.type).toBe('OPENING_STOCK')
  })

  it('receives stock against a PO (partial, damaged) and blends cost; same receipt twice adds once', async () => {
    const p = await shoe(A.manager, { qty: 10, sizes: ['36'] })
    const v = p.variants[0]!
    const supplier = await createSupplier(A.manager, { name: 'Shoe Supplier Ltd' })
    const po = await createPurchaseOrder(A.manager, { supplierId: supplier.id, items: [{ variantId: v.id, orderedQty: 20, unitCost: 260000 }] })
    await setPurchaseOrderStatus(A.manager, po.id, 'ORDERED')
    const k = key()
    const input = { purchaseOrderId: po.id, idempotencyKey: k, reference: 'INV-77', items: [{ variantId: v.id, receivedQty: 12, acceptedQty: 10, damagedQty: 2, unitCost: 260000 }] }
    const r1 = await receiveGoods(A.inventory, input)
    const r2 = await receiveGoods(A.inventory, input)
    expect(r2.id).toBe(r1.id)
    const b = await balance(v.id)
    expect(b.onHand).toBe(20) // only accepted units are sellable
    expect(b.avgCost).toBe(230000) // (10*2000 + 10*2600)/20
    const updatedPo = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: po.id }, include: { items: true } })
    expect(updatedPo.status).toBe('PARTIALLY_RECEIVED')
    expect(updatedPo.items[0]!.receivedQty).toBe(12)
  })

  it('never lets stock go negative', async () => {
    const p = await shoe(A.manager, { qty: 2, sizes: ['37'] })
    await expect(createAdjustment(A.manager, { reason: 'DAMAGE', notes: 'water damage', items: [{ variantId: p.variants[0]!.id, qtyChange: -3 }] }))
      .rejects.toMatchObject({ code: 'insufficient_stock' })
    expect((await balance(p.variants[0]!.id)).onHand).toBe(2)
  })

  it('a dedupe key applies a stock effect exactly once', async () => {
    const p = await shoe(A.manager, { qty: 5, sizes: ['43'] })
    const v = p.variants[0]!.id
    const { withTx } = await import('../server/lib/prisma')
    const first = await withTx(tx => applyMovement(tx, { variantId: v, type: 'ADJUSTMENT', qtyOnHand: -1, dedupeKey: 'test:once' }))
    const second = await withTx(tx => applyMovement(tx, { variantId: v, type: 'ADJUSTMENT', qtyOnHand: -1, dedupeKey: 'test:once' }))
    expect(first.duplicate).toBe(false)
    expect(second.duplicate).toBe(true)
    expect((await balance(v)).onHand).toBe(4)
  })

  it('the ledger is append-only at the database level', async () => {
    const m = await prisma.inventoryMovement.findFirstOrThrow()
    await expect(prisma.inventoryMovement.update({ where: { id: m.id }, data: { notes: 'tamper' } })).rejects.toThrow(/append-only/)
    await expect(prisma.inventoryMovement.delete({ where: { id: m.id } })).rejects.toThrow(/append-only/)
  })

  it('large adjustments by inventory staff require approval', async () => {
    const p = await shoe(A.manager, { qty: 20, sizes: ['44'] })
    const v = p.variants[0]!.id
    const small = await createAdjustment(A.inventory, { reason: 'LOSS', notes: 'missing', items: [{ variantId: v, qtyChange: -2 }] })
    expect(small.status).toBe('APPLIED')
    const big = await createAdjustment(A.inventory, { reason: 'DATA_CORRECTION', notes: 'miscount', items: [{ variantId: v, qtyChange: -10 }] })
    expect(big.status).toBe('PENDING_APPROVAL')
    expect((await balance(v)).onHand).toBe(18)
    await expect(decideAdjustment(A.inventory, big.id, true)).rejects.toMatchObject({ code: 'forbidden' })
    await decideAdjustment(A.manager, big.id, true)
    expect((await balance(v)).onHand).toBe(8)
    await expect(decideAdjustment(A.manager, big.id, true)).rejects.toMatchObject({ code: 'already_decided' })
  })

  it('stocktake posts only discrepancies, relative to the snapshot', async () => {
    const p = await shoe(A.manager, { qty: 10, sizes: ['35', '45'], name: 'Count Sneaker' })
    const [a, b] = p.variants
    const st = await startStocktake(A.inventory, { name: 'Shoes count', categoryId: p.categoryId })
    // A sale-like deduction happens during the count: must be preserved.
    await createAdjustment(A.manager, { reason: 'LOSS', notes: 'during count', items: [{ variantId: a!.id, qtyChange: -1 }] })
    await recordCounts(A.inventory, st.id, [{ variantId: a!.id, countedQty: 8 }, { variantId: b!.id, countedQty: 10 }])
    await submitStocktake(A.inventory, st.id)
    await expect(finalizeStocktake(A.inventory, st.id)).rejects.toMatchObject({ code: 'forbidden' })
    const res = await finalizeStocktake(A.manager, st.id)
    expect(res.adjustedLines).toBe(1)
    expect((await balance(a!.id)).onHand).toBe(7) // 10 - 1 (loss) + (8 - 10)
    expect((await balance(b!.id)).onHand).toBe(10)
  })
})

describe('csv import', () => {
  it('previews errors and commits valid files transactionally', async () => {
    const bad = 'category_code,product_name,price,attr_material,attr_color,opening_qty\nSC,Bad scarf,abc,Wool,Red,2\nZZ,Unknown,10,,,\n'
    const preview = await previewImport(A.owner, bad)
    expect(preview.errors.length).toBeGreaterThanOrEqual(3)
    await expect(commitImport(A.owner, bad)).rejects.toMatchObject({ code: 'import_invalid' })

    const good = 'category_code,product_name,price,cost_price,status,attr_material,attr_color,opening_qty\nSC,Imported Scarf,1500.00,700,ACTIVE,Silk,Black,4\nSC,Imported Scarf,1500.00,700,ACTIVE,Silk,Gold,0\n'
    const result = await commitImport(A.owner, good)
    expect(result).toMatchObject({ products: 1, variants: 2 })
    const product = await prisma.product.findFirstOrThrow({ where: { name: 'Imported Scarf' }, include: { variants: { include: { inventory: true } } } })
    expect(product.variants.map(v => v.inventory!.onHand).sort()).toEqual([0, 4])
    expect(await prisma.stockAdjustment.findUnique({ where: { number: result.adjustmentNumber! } })).toMatchObject({ reason: 'OPENING_STOCK', status: 'APPLIED' })
  })

  it('cannot be run without permission', async () => {
    await expect(previewImport(A.cashier, 'x')).rejects.toMatchObject({ code: 'forbidden' })
  })
})
