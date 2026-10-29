import type { PaymentMethodType, PrismaClient } from '@prisma/client'
import { DEFAULT_ROLES } from '../../shared/permissions'

/**
 * Reference data every installation needs. Idempotent: safe to run on every deploy.
 * Payment methods record money received outside StyleGrab; none of them talk to a gateway.
 */
export const DEFAULT_PAYMENT_METHODS: { code: string, name: string, type: PaymentMethodType, requiresReference: boolean, requiresVerification: boolean, isSystem?: boolean, instructions?: string }[] = [
  { code: 'CASH', name: 'Cash', type: 'CASH', requiresReference: false, requiresVerification: false },
  { code: 'MPESA', name: 'M-Pesa', type: 'MOBILE_MONEY', requiresReference: true, requiresVerification: true, instructions: 'Pay via M-Pesa to our Till/Paybill and keep the confirmation code. Staff will verify it.' },
  { code: 'BANK', name: 'Bank transfer', type: 'BANK_TRANSFER', requiresReference: true, requiresVerification: true },
  { code: 'CARD', name: 'Card (external terminal)', type: 'CARD_TERMINAL', requiresReference: false, requiresVerification: false },
  { code: 'EXCHANGE', name: 'Exchange credit', type: 'EXCHANGE_CREDIT', requiresReference: false, requiresVerification: false, isSystem: true },
]

export const DEFAULT_CATEGORIES: { name: string, code: string, attributes: { code: string, name: string, options: string[], isRequired: boolean }[], children: { name: string, code: string }[] }[] = [
  {
    name: 'Scarves', code: 'SC',
    attributes: [
      { code: 'material', name: 'Material', options: ['Silk', 'Cotton', 'Satin', 'Chiffon'], isRequired: true },
      { code: 'color', name: 'Colour', options: [], isRequired: true },
      { code: 'pattern', name: 'Pattern', options: [], isRequired: false },
      { code: 'size', name: 'Size', options: ['Small', 'Medium', 'Large', 'Oversized'], isRequired: false },
    ],
    children: [{ name: 'Silk scarves', code: 'SCS' }, { name: 'Cotton scarves', code: 'SCC' }],
  },
  {
    name: 'Belts', code: 'BT',
    attributes: [
      { code: 'material', name: 'Material', options: ['Leather', 'Faux leather', 'Fabric', 'Chain'], isRequired: true },
      { code: 'color', name: 'Colour', options: [], isRequired: true },
      { code: 'buckle', name: 'Buckle style', options: [], isRequired: false },
      { code: 'width', name: 'Width', options: [], isRequired: false },
      { code: 'size', name: 'Size', options: ['XS', 'S', 'M', 'L', 'XL'], isRequired: true },
    ],
    children: [],
  },
  {
    name: 'Bags', code: 'BG',
    attributes: [
      { code: 'color', name: 'Colour', options: [], isRequired: true },
      { code: 'material', name: 'Material', options: [], isRequired: false },
      { code: 'dimensions', name: 'Dimensions', options: [], isRequired: false },
    ],
    children: [{ name: 'Handbags', code: 'BGH' }, { name: 'Tote bags', code: 'BGT' }, { name: 'Crossbody bags', code: 'BGC' }],
  },
  {
    name: 'Shoes', code: 'SH',
    attributes: [
      { code: 'color', name: 'Colour', options: [], isRequired: true },
      { code: 'size', name: 'Size (EU)', options: ['35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45'], isRequired: true },
    ],
    children: [{ name: 'Sneakers', code: 'SHS' }, { name: 'Heels', code: 'SHH' }, { name: 'Sandals', code: 'SHD' }],
  },
]

export async function bootstrapReferenceData(db: PrismaClient, opts: { categories?: boolean } = {}) {
  for (const role of DEFAULT_ROLES) {
    await db.role.upsert({
      where: { key: role.key },
      create: { key: role.key, name: role.name, description: role.description, permissions: role.permissions, isSystem: true },
      // Only the owner role is forced to the full catalogue; other roles keep admin customisations.
      update: role.key === 'owner' ? { permissions: role.permissions } : {},
    })
  }
  for (const [i, m] of DEFAULT_PAYMENT_METHODS.entries()) {
    await db.paymentMethod.upsert({ where: { code: m.code }, create: { ...m, sortOrder: i, isSystem: m.isSystem ?? false }, update: {} })
  }
  await db.posRegister.upsert({ where: { name: 'Main counter' }, create: { name: 'Main counter' }, update: {} })

  if (opts.categories && (await db.category.count()) === 0) {
    for (const [i, c] of DEFAULT_CATEGORIES.entries()) {
      const parent = await db.category.create({
        data: { name: c.name, code: c.code, slug: c.name.toLowerCase(), sortOrder: i, attributes: { create: c.attributes.map((a, j) => ({ ...a, sortOrder: j })) } },
      })
      for (const [j, child] of c.children.entries()) {
        await db.category.create({ data: { name: child.name, code: child.code, slug: child.name.toLowerCase().replace(/\s+/g, '-'), parentId: parent.id, sortOrder: j } })
      }
    }
  }
}
