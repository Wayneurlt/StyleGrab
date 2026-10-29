import { z } from 'zod'

/** Money crosses the API as integer minor units. */
export const money = z.number().int().min(0).max(2_000_000_000)
export const id = z.string().min(1).max(64)
export const qty = z.number().int()
export const idemKey = z.string().min(8).max(100)
const optStr = (max: number) => z.string().trim().max(max).nullish()

export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  q: z.string().trim().max(100).optional(),
})

export const rangeQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

export const discount = z.object({ type: z.enum(['FIXED', 'PERCENT']), value: z.number().int().min(0).max(2_000_000_000) }).nullish()

export const line = z.object({
  variantId: id,
  quantity: z.number().int().min(1).max(999),
  unitPrice: money.nullish(),
  discount,
})

export const paymentInput = z.object({
  methodId: id,
  amount: money.refine(v => v > 0, 'Amount must be greater than zero'),
  tendered: money.nullish(),
  reference: optStr(60),
  notes: optStr(500),
  receivedAt: z.coerce.date().optional(),
  idempotencyKey: idemKey.nullish(),
})

export const contact = z.object({
  name: optStr(120),
  phone: optStr(30),
  email: optStr(120),
  address: optStr(500),
})

export const categoryInput = z.object({
  name: z.string().trim().min(1).max(80),
  code: z.string().trim().min(1).max(6).regex(/^[A-Za-z0-9]+$/, 'Letters and numbers only'),
  description: optStr(1000),
  parentId: id.nullish(),
  isVisible: z.boolean().optional(),
  imageKey: z.string().max(80).nullish(),
  sortOrder: z.number().int().optional(),
})

export const attributeInput = z.object({
  id: id.optional(),
  name: z.string().trim().min(1).max(40),
  code: z.string().trim().min(1).max(30),
  options: z.array(z.string().trim().max(40)).max(100),
  isRequired: z.boolean(),
})

export const variantInput = z.object({
  id: id.optional(),
  sku: z.string().trim().max(60).regex(/^[A-Za-z0-9._-]*$/, 'SKUs may contain letters, numbers, dots, dashes and underscores').nullish(),
  barcode: z.string().trim().max(60).nullish(),
  attributes: z.record(z.string().max(30), z.string().trim().max(60)),
  price: money.nullish(),
  costPrice: money.nullish(),
  isArchived: z.boolean().optional(),
  lowStockThreshold: z.number().int().min(0).max(100000).nullish(),
})

export const productInput = z.object({
  name: z.string().trim().min(1).max(150),
  description: z.string().max(10000).optional(),
  categoryId: id,
  brand: optStr(80),
  price: money,
  costPrice: money.nullish(),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional(),
  isFeatured: z.boolean().optional(),
  seoTitle: optStr(70),
  seoDescription: optStr(170),
  variants: z.array(variantInput).min(1).max(200),
})

export const customerInput = z.object({
  name: z.string().trim().min(1).max(120),
  phone: optStr(30),
  email: optStr(120),
  notes: optStr(2000),
  isActive: z.boolean().optional(),
})

export const supplierInput = z.object({
  name: z.string().trim().min(1).max(120),
  contactPerson: optStr(120),
  phone: optStr(30),
  email: optStr(120),
  address: optStr(500),
  notes: optStr(2000),
  isActive: z.boolean().optional(),
})

export const purchaseOrderInput = z.object({
  supplierId: id,
  expectedAt: z.coerce.date().nullish(),
  notes: optStr(2000),
  items: z.array(z.object({ variantId: id, orderedQty: z.number().int().min(1).max(100000), unitCost: money })).min(1).max(500),
})

export const receiptInput = z.object({
  purchaseOrderId: id.nullish(),
  supplierId: id.nullish(),
  reference: optStr(80),
  receivedAt: z.coerce.date().optional(),
  notes: optStr(2000),
  idempotencyKey: idemKey,
  items: z.array(z.object({
    variantId: id,
    receivedQty: z.number().int().min(0).max(100000),
    acceptedQty: z.number().int().min(0).max(100000),
    damagedQty: z.number().int().min(0).max(100000).optional(),
    unitCost: money,
    notes: optStr(500),
  })).min(1).max(500),
})

export const adjustmentInput = z.object({
  reason: z.enum(['OPENING_STOCK', 'COUNT_DISCREPANCY', 'DAMAGE', 'LOSS', 'DATA_CORRECTION', 'OTHER']),
  notes: optStr(1000),
  items: z.array(z.object({ variantId: id, qtyChange: z.number().int().min(-100000).max(100000), unitCost: money.nullish() })).min(1).max(500),
})

export const posSaleInput = z.object({
  idempotencyKey: idemKey,
  lines: z.array(line).min(1).max(200),
  orderDiscount: discount,
  customerId: id.nullish(),
  contact: contact.nullish(),
  payments: z.array(paymentInput).max(10).optional(),
  shiftId: id.nullish(),
  internalNote: optStr(1000),
})

export const manualOrderInput = z.object({
  idempotencyKey: idemKey,
  channel: z.enum(['WHATSAPP', 'INSTAGRAM', 'FACEBOOK', 'PHONE', 'OTHER']),
  lines: z.array(line).min(1).max(200),
  orderDiscount: discount,
  customerId: id.nullish(),
  contact: contact.nullish(),
  fulfilmentType: z.enum(['PICKUP', 'DELIVERY', 'IN_STORE']).optional(),
  customerNote: optStr(1000),
  internalNote: optStr(1000),
  assignedToId: id.nullish(),
  payments: z.array(paymentInput).max(10).optional(),
})

export const checkoutInput = z.object({
  idempotencyKey: idemKey,
  lines: z.array(z.object({ variantId: id, quantity: z.number().int().min(1).max(20) })).min(1).max(50),
  contact: z.object({
    name: z.string().trim().min(2).max(120),
    phone: z.string().trim().min(7).max(30),
    email: z.string().trim().email().max(120).optional().or(z.literal('')),
    address: optStr(500),
  }),
  fulfilmentType: z.enum(['PICKUP', 'DELIVERY']),
  customerNote: optStr(1000),
})

export const returnInput = z.object({
  orderId: id,
  idempotencyKey: idemKey,
  reason: z.string().trim().min(2).max(500),
  notes: optStr(1000),
  resolution: z.enum(['REFUND', 'EXCHANGE', 'NO_REFUND']),
  items: z.array(z.object({ orderItemId: id, quantity: z.number().int().min(1).max(999), condition: z.enum(['SALEABLE', 'DAMAGED', 'NEEDS_INSPECTION']) })).min(1).max(200),
  refund: z.object({ methodId: id, amount: money, reference: optStr(60), notes: optStr(500) }).nullish(),
  exchange: z.object({ lines: z.array(line).min(1).max(200), orderDiscount: discount, payments: z.array(paymentInput).max(10).optional() }).nullish(),
  shiftId: id.nullish(),
})

export const settingsInput = z.object({
  businessName: z.string().trim().min(1).max(80),
  currency: z.string().trim().length(3).toUpperCase(),
  timezone: z.string().trim().min(1).max(60).refine((tz) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: tz })
      return true
    }
    catch {
      return false
    }
  }, 'Unknown timezone'),
  contactPhone: z.string().trim().max(40),
  contactEmail: z.string().trim().max(120),
  address: z.string().trim().max(300),
  receiptFooter: z.string().max(500),
  returnPolicy: z.string().max(1000),
  maxDiscountBpsWithoutOverride: z.number().int().min(0).max(10000),
  adjustmentApprovalThreshold: z.number().int().min(0).max(100000),
  reservationHours: z.number().int().min(1).max(336),
  defaultLowStockThreshold: z.number().int().min(0).max(100000),
  requireOpenShiftForCash: z.boolean(),
})

export const paymentMethodInput = z.object({
  code: z.string().trim().min(2).max(20).regex(/^[A-Z0-9_]+$/i).transform(s => s.toUpperCase()),
  name: z.string().trim().min(1).max(60),
  type: z.enum(['CASH', 'MOBILE_MONEY', 'BANK_TRANSFER', 'CARD_TERMINAL', 'OTHER']),
  requiresReference: z.boolean(),
  requiresVerification: z.boolean(),
  instructions: optStr(500),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
})
