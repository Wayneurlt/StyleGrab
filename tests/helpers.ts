import { randomUUID } from 'node:crypto'
import type { Actor } from '../server/lib/actor'
import { bootstrapReferenceData } from '../server/lib/bootstrap'
import { prisma } from '../server/lib/prisma'
import { createProduct } from '../server/services/catalog'
import { createAdjustment } from '../server/services/inventory'
import { openShift } from '../server/services/shifts'

export { prisma }
export const key = () => randomUUID()

/** Wipe every table (TRUNCATE bypasses the append-only row triggers) and reload reference data. */
export async function resetDb() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map(t => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`)
  await bootstrapReferenceData(prisma, { categories: true })
}

async function makeUser(roleKey: string): Promise<Actor> {
  const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } })
  const user = await prisma.user.create({ data: { email: `${roleKey}-${randomUUID().slice(0, 8)}@test.local`, name: roleKey, roleId: role.id, passwordHash: 'x' } })
  return { userId: user.id, label: user.email, permissions: new Set(role.permissions) }
}

export async function actors() {
  return {
    owner: await makeUser('owner'),
    manager: await makeUser('manager'),
    cashier: await makeUser('cashier'),
    inventory: await makeUser('inventory'),
    viewer: await makeUser('viewer'),
  }
}

export const guest: Actor = { userId: null, label: 'guest', permissions: new Set() }

export async function method(code: string) {
  return prisma.paymentMethod.findUniqueOrThrow({ where: { code } })
}

/** A shoe product with sizes, `qty` units each, cost 2,000.00 and price 5,000.00. */
export async function shoe(actor: Actor, opts: { sizes?: string[], qty?: number, name?: string } = {}) {
  const category = await prisma.category.findUniqueOrThrow({ where: { code: 'SH' } })
  const p = await createProduct(actor, {
    name: opts.name ?? 'Test Sneaker',
    categoryId: category.id,
    price: 500000,
    costPrice: 200000,
    status: 'ACTIVE',
    variants: (opts.sizes ?? ['38', '39']).map(size => ({ attributes: { color: 'White', size } })),
  })
  if ((opts.qty ?? 0) > 0) {
    await createAdjustment(actor, { reason: 'OPENING_STOCK', items: p.variants.map(v => ({ variantId: v.id, qtyChange: opts.qty!, unitCost: 200000 })) })
  }
  return p
}

export async function balance(variantId: string) {
  return prisma.inventoryBalance.findUniqueOrThrow({ where: { variantId } })
}

export async function shiftFor(actor: Actor, openingCash = 0) {
  const register = await prisma.posRegister.findFirstOrThrow()
  return openShift(actor, { registerId: register.id, openingCash })
}
