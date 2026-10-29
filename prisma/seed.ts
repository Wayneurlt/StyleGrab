/**
 * Seed script.
 *  - Always: reference data (roles, payment methods, register, default categories when empty).
 *  - Owner account from SEED_OWNER_EMAIL / SEED_OWNER_PASSWORD when no owner exists yet.
 *  - Demo catalogue + stock ONLY when SEED_DEMO_DATA=true (development). Never enable this in production.
 */
import { randomBytes } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { bootstrapReferenceData } from '../server/lib/bootstrap'
import type { Actor } from '../server/lib/actor'
import { hashPassword } from '../server/services/auth'
import { createProduct } from '../server/services/catalog'
import { createAdjustment } from '../server/services/inventory'

const prisma = new PrismaClient()

async function main() {
  await bootstrapReferenceData(prisma, { categories: true })
  console.log('✔ reference data')

  const ownerRole = await prisma.role.findUniqueOrThrow({ where: { key: 'owner' } })
  let owner = await prisma.user.findFirst({ where: { roleId: ownerRole.id } })
  const ownerEmail = process.env.SEED_OWNER_EMAIL?.trim().toLowerCase()
  if (!owner && !ownerEmail) {
    console.warn('! no owner account exists — rerun with SEED_OWNER_EMAIL (and optionally SEED_OWNER_PASSWORD) to create one')
    return
  }
  if (!owner) {
    const email = ownerEmail!
    const generated = !process.env.SEED_OWNER_PASSWORD
    const password = process.env.SEED_OWNER_PASSWORD || `${randomBytes(9).toString('base64url')}7a`
    owner = await prisma.user.create({ data: { email, name: process.env.SEED_OWNER_NAME || 'Owner', roleId: ownerRole.id, passwordHash: await hashPassword(password) } })
    console.log(`✔ owner account ${email}${generated ? ` — generated password: ${password} (change it after signing in)` : ''}`)
  }

  if (process.env.SEED_DEMO_DATA !== 'true') return
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to seed demo data with NODE_ENV=production')
  if (await prisma.product.count()) {
    console.log('• products exist, skipping demo catalogue')
    return
  }

  const actor: Actor = { userId: owner.id, label: owner.email, permissions: new Set(['*']) }
  const cat = async (code: string) => (await prisma.category.findUniqueOrThrow({ where: { code } })).id
  const demo = [
    { name: 'Silk Square Scarf', categoryId: await cat('SCS'), price: 250000, costPrice: 110000, variants: ['Black', 'Burgundy', 'Ivory'].map(color => ({ attributes: { material: 'Silk', color }, qty: 8 })) },
    { name: 'Cotton Wrap Scarf', categoryId: await cat('SCC'), price: 150000, costPrice: 60000, variants: ['Sand', 'Olive'].map(color => ({ attributes: { material: 'Cotton', color, size: 'Large' }, qty: 12 })) },
    { name: 'Classic Leather Belt', categoryId: await cat('BT'), price: 220000, costPrice: 90000, variants: ['S', 'M', 'L'].map(size => ({ attributes: { material: 'Leather', color: 'Tan', size, buckle: 'Brass pin' }, qty: 5 })) },
    { name: 'Structured Tote', categoryId: await cat('BGT'), price: 650000, costPrice: 300000, variants: ['Black', 'Camel'].map(color => ({ attributes: { color, material: 'Faux leather' }, qty: 4 })) },
    { name: 'Mini Crossbody Bag', categoryId: await cat('BGC'), price: 420000, costPrice: 190000, variants: ['Teal', 'Cream'].map(color => ({ attributes: { color }, qty: 2 })) },
    { name: 'Everyday Leather Sneaker', categoryId: await cat('SHS'), price: 580000, costPrice: 260000, variants: ['37', '38', '39', '40', '41'].map(size => ({ attributes: { color: 'White', size }, qty: 3 })) },
    { name: 'Block Heel Sandal', categoryId: await cat('SHD'), price: 480000, costPrice: 210000, variants: ['37', '38', '39'].map(size => ({ attributes: { color: 'Nude', size }, qty: 1 })) },
  ]
  const opening: { variantId: string, qtyChange: number, unitCost: number }[] = []
  for (const [i, d] of demo.entries()) {
    const p = await createProduct(actor, {
      name: d.name,
      categoryId: d.categoryId,
      price: d.price,
      costPrice: d.costPrice,
      status: 'ACTIVE',
      isFeatured: i < 4,
      description: `${d.name} — demo product created by the development seed. Replace with real catalogue data.`,
      variants: d.variants.map(v => ({ attributes: v.attributes })),
    })
    p.variants.forEach((v, j) => opening.push({ variantId: v.id, qtyChange: d.variants[j]!.qty, unitCost: d.costPrice }))
  }
  await createAdjustment(actor, { reason: 'OPENING_STOCK', notes: 'Demo seed', items: opening })
  console.log(`✔ demo catalogue: ${demo.length} products, ${opening.length} variants with opening stock`)
}

main().then(() => prisma.$disconnect()).catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
