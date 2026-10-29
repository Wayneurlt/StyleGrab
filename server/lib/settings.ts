import { z } from 'zod'
import { prisma, type Tx } from './prisma'

export const settingsSchema = z.object({
  businessName: z.string().min(1).max(80),
  currency: z.string().length(3),
  timezone: z.string().min(1),
  contactPhone: z.string().max(40),
  contactEmail: z.string().max(120),
  address: z.string().max(300),
  receiptFooter: z.string().max(500),
  returnPolicy: z.string().max(1000),
  /** Discounts up to this (basis points of the line/order subtotal) need only `pos.discount`. */
  maxDiscountBpsWithoutOverride: z.number().int().min(0).max(10_000),
  /** Adjustments whose total absolute quantity exceeds this need approval unless the actor can approve. */
  adjustmentApprovalThreshold: z.number().int().min(0),
  /** Website orders that remain unconfirmed & unpaid release their stock reservation after this many hours. */
  reservationHours: z.number().int().min(1).max(24 * 14),
  defaultLowStockThreshold: z.number().int().min(0),
  requireOpenShiftForCash: z.boolean(),
})

export type Settings = z.infer<typeof settingsSchema>

export const DEFAULT_SETTINGS: Settings = {
  businessName: 'StyleGrab',
  currency: 'KES',
  timezone: 'Africa/Nairobi',
  contactPhone: '',
  contactEmail: '',
  address: '',
  receiptFooter: 'Thank you for shopping with StyleGrab.',
  returnPolicy: '',
  maxDiscountBpsWithoutOverride: 1000,
  adjustmentApprovalThreshold: 5,
  reservationHours: 48,
  defaultLowStockThreshold: 3,
  requireOpenShiftForCash: false,
}

const SETTINGS_KEY = 'app'

export async function getSettings(db: Tx | typeof prisma = prisma): Promise<Settings> {
  const row = await db.setting.findUnique({ where: { key: SETTINGS_KEY } })
  const parsed = settingsSchema.partial().safeParse(row?.value ?? {})
  return { ...DEFAULT_SETTINGS, ...(parsed.success ? parsed.data : {}) }
}

export async function saveSettings(tx: Tx, value: Settings): Promise<void> {
  await tx.setting.upsert({ where: { key: SETTINGS_KEY }, create: { key: SETTINGS_KEY, value }, update: { value } })
}
