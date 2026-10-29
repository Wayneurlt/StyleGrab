import { beforeAll, describe, expect, it } from 'vitest'
import { createOrder, expireStaleReservations, transitionOrder } from '../server/services/orders'
import { recordPayment, verifyPayment, voidPayment } from '../server/services/payments'
import { createReturn, resolveInspection } from '../server/services/returns'
import { addCashMovement, closeShift, shiftSummary } from '../server/services/shifts'
import { systemActor } from '../server/lib/actor'
import { withTx } from '../server/lib/prisma'
import { DEFAULT_SETTINGS, saveSettings } from '../server/lib/settings'
import { actors, balance, guest, key, method, prisma, resetDb, shiftFor, shoe } from './helpers'

let A: Awaited<ReturnType<typeof actors>>
let shiftId: string

beforeAll(async () => {
  await resetDb()
  A = await actors()
  shiftId = (await shiftFor(A.cashier, 100000)).id
})

describe('POS sales', () => {
  it('records a sale, deducts stock exactly once, snapshots values and cost', async () => {
    const p = await shoe(A.manager, { qty: 5, sizes: ['38'] })
    const v = p.variants[0]!
    const cash = await method('CASH')
    const input = { mode: 'pos' as const, idempotencyKey: key(), shiftId, lines: [{ variantId: v.id, quantity: 2 }], payments: [{ methodId: cash.id, amount: 1000000, tendered: 1000000 }] }
    const sale = await createOrder(A.cashier, input)
    const retry = await createOrder(A.cashier, input) // double submit
    expect(retry.id).toBe(sale.id)
    expect(sale.status).toBe('COMPLETED')
    expect(sale.paymentStatus).toBe('PAID')
    expect(sale.number).toMatch(/^SG-\d+$/)
    expect(sale.total).toBe(1000000)
    expect((await balance(v.id)).onHand).toBe(3)
    expect(await prisma.inventoryMovement.count({ where: { referenceId: sale.id, type: 'SALE' } })).toBe(1)

    // Editing the product later does not change the historical line.
    await prisma.product.update({ where: { id: p.id }, data: { name: 'Renamed', price: 1 } })
    const item = await prisma.orderItem.findFirstOrThrow({ where: { orderId: sale.id } })
    expect(item).toMatchObject({ productName: 'Test Sneaker', unitPrice: 500000, unitCost: 200000, lineTotal: 1000000 })
  })

  it('validates prices on the server and permission-checks discounts and overrides', async () => {
    const p = await shoe(A.manager, { qty: 5, sizes: ['39'] })
    const v = p.variants[0]!
    await expect(createOrder(A.cashier, { mode: 'pos', idempotencyKey: key(), shiftId, lines: [{ variantId: v.id, quantity: 1, unitPrice: 100 }] }))
      .rejects.toMatchObject({ code: 'forbidden' })
    // 10% is within the cashier's limit; 20% is not.
    const ok = await createOrder(A.cashier, { mode: 'pos', idempotencyKey: key(), shiftId, lines: [{ variantId: v.id, quantity: 1, discount: { type: 'PERCENT', value: 1000 } }] })
    expect(ok.total).toBe(450000)
    await expect(createOrder(A.cashier, { mode: 'pos', idempotencyKey: key(), shiftId, lines: [{ variantId: v.id, quantity: 1 }], orderDiscount: { type: 'PERCENT', value: 2000 } }))
      .rejects.toMatchObject({ code: 'forbidden' })
    const mgr = await createOrder(A.manager, { mode: 'pos', idempotencyKey: key(), lines: [{ variantId: v.id, quantity: 2 }], orderDiscount: { type: 'FIXED', value: 1001 } })
    expect(mgr.discountTotal).toBe(1001)
    expect(mgr.items.reduce((s, i) => s + i.lineTotal, 0)).toBe(mgr.total)
    // Website checkout can never carry discounts.
    await expect(createOrder(guest, { mode: 'web', idempotencyKey: key(), lines: [{ variantId: v.id, quantity: 1, unitPrice: 1 }], contact: { name: 'X', phone: '0712000000' } }))
      .rejects.toMatchObject({ code: 'forbidden' })
  })

  it('represents partial, pending and unpaid balances; rejects overpayment and duplicate references', async () => {
    const p = await shoe(A.manager, { qty: 5, sizes: ['40'] })
    const cash = await method('CASH')
    const mpesa = await method('MPESA')
    const sale = await createOrder(A.cashier, { mode: 'pos', idempotencyKey: key(), shiftId, lines: [{ variantId: p.variants[0]!.id, quantity: 1 }], payments: [{ methodId: cash.id, amount: 200000 }] })
    expect(sale.paymentStatus).toBe('PARTIALLY_PAID')

    await expect(recordPayment(A.cashier, sale.id, { methodId: mpesa.id, amount: 300000 })).rejects.toMatchObject({ code: 'reference_required' })
    await expect(recordPayment(A.cashier, sale.id, { methodId: mpesa.id, amount: 300001, reference: 'ABC' })).rejects.toMatchObject({ code: 'overpayment' })
    const mp = await recordPayment(A.cashier, sale.id, { methodId: mpesa.id, amount: 300000, reference: ' qkx12ab ' })
    expect(mp.status).toBe('PENDING_CONFIRMATION')
    expect(mp.reference).toBe('QKX12AB')
    expect((await prisma.order.findUniqueOrThrow({ where: { id: sale.id } })).paymentStatus).toBe('AWAITING_CONFIRMATION')

    // The same M-Pesa code on another order is rejected.
    const other = await createOrder(A.cashier, { mode: 'pos', idempotencyKey: key(), shiftId, lines: [{ variantId: p.variants[0]!.id, quantity: 1 }] })
    expect(other.paymentStatus).toBe('UNPAID')
    await expect(recordPayment(A.cashier, other.id, { methodId: mpesa.id, amount: 1000, reference: 'QKX12AB' })).rejects.toMatchObject({ code: 'duplicate_reference' })

    // Cashiers cannot verify; managers can. Fulfilment status is untouched.
    await expect(verifyPayment(A.cashier, mp.id, { approve: true })).rejects.toMatchObject({ code: 'forbidden' })
    const verified = await verifyPayment(A.manager, mp.id, { approve: true })
    expect(verified.paymentStatus).toBe('PAID')
    expect(verified.status).toBe('COMPLETED')

    // A rejected reference can be re-entered; a voided cash entry drops the paid amount.
    const pay2 = await recordPayment(A.cashier, other.id, { methodId: mpesa.id, amount: 1000, reference: 'ZZZ999' })
    await verifyPayment(A.manager, pay2.id, { approve: false, note: 'not on statement' })
    await recordPayment(A.cashier, other.id, { methodId: mpesa.id, amount: 1000, reference: 'ZZZ999' })
    const cashPay = await recordPayment(A.cashier, other.id, { methodId: cash.id, amount: 5000 }, { shiftId })
    const afterVoid = await voidPayment(A.manager, cashPay.id, 'keyed twice')
    expect(afterVoid.amountPaid).toBe(0)
    expect(afterVoid.amountPending).toBe(1000)
  })

  it('records counter payments as received, with the M-Pesa code optional', async () => {
    const p = await shoe(A.manager, { qty: 2, sizes: ['41'] })
    const mpesa = await method('MPESA')
    const sale = await createOrder(A.cashier, { mode: 'pos', idempotencyKey: key(), lines: [{ variantId: p.variants[0]!.id, quantity: 1 }], payments: [{ methodId: mpesa.id, amount: 500000 }] })
    expect(sale.paymentStatus).toBe('PAID')
    expect(sale.payments[0]!.status).toBe('CONFIRMED')
    // Remote orders still go through verification.
    const remote = await createOrder(A.manager, { mode: 'manual', channel: 'WHATSAPP', idempotencyKey: key(), lines: [{ variantId: p.variants[0]!.id, quantity: 1 }], contact: { name: 'R', phone: '0711999000' } })
    await expect(recordPayment(A.manager, remote.id, { methodId: mpesa.id, amount: 500000 })).rejects.toMatchObject({ code: 'reference_required' })
    const pending = await recordPayment(A.manager, remote.id, { methodId: mpesa.id, amount: 500000, reference: 'REMOTE1' })
    expect(pending.status).toBe('PENDING_CONFIRMATION')
  })

  it('requires an open shift for POS cash when the setting is on', async () => {
    await withTx(tx => saveSettings(tx, { ...DEFAULT_SETTINGS, requireOpenShiftForCash: true }))
    const p = await shoe(A.manager, { qty: 1, sizes: ['41'], name: 'Shift Sneaker' })
    const cash = await method('CASH')
    await expect(createOrder(A.cashier, { mode: 'pos', idempotencyKey: key(), lines: [{ variantId: p.variants[0]!.id, quantity: 1 }], payments: [{ methodId: cash.id, amount: 500000 }] }))
      .rejects.toMatchObject({ code: 'shift_required' })
    expect((await balance(p.variants[0]!.id)).onHand).toBe(1) // failed sale left no partial stock change
    expect(await prisma.order.count({ where: { items: { some: { variantId: p.variants[0]!.id } } } })).toBe(0)
  })
})

describe('concurrency', () => {
  it('two simultaneous sales cannot both take the last unit', async () => {
    const p = await shoe(A.manager, { qty: 1, sizes: ['42'] })
    const v = p.variants[0]!.id
    const attempt = () => createOrder(A.manager, { mode: 'pos', idempotencyKey: key(), lines: [{ variantId: v, quantity: 1 }] })
    const results = await Promise.allSettled([attempt(), attempt(), attempt()])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.filter(r => r.status === 'rejected') as PromiseRejectedResult[]
    expect(rejected.every(r => r.reason.code === 'insufficient_stock')).toBe(true)
    expect((await balance(v)).onHand).toBe(0)
  })

  it('website, POS and manual orders share one inventory balance', async () => {
    const p = await shoe(A.manager, { qty: 3, sizes: ['43'] })
    const v = p.variants[0]!.id
    const web = await createOrder(guest, { mode: 'web', idempotencyKey: key(), lines: [{ variantId: v, quantity: 1 }], contact: { name: 'Web Buyer', phone: '0712345678' } })
    expect(web.status).toBe('PENDING')
    const manual = await createOrder(A.manager, { mode: 'manual', channel: 'WHATSAPP', idempotencyKey: key(), lines: [{ variantId: v, quantity: 1 }], contact: { name: 'WA Buyer', phone: '0722000111' } })
    expect(manual.channel).toBe('WHATSAPP')
    expect(await balance(v)).toMatchObject({ onHand: 3, reserved: 2 })
    await createOrder(A.manager, { mode: 'pos', idempotencyKey: key(), lines: [{ variantId: v, quantity: 1 }] })
    expect(await balance(v)).toMatchObject({ onHand: 2, reserved: 2 })
    // Available is now zero for every channel.
    await expect(createOrder(guest, { mode: 'web', idempotencyKey: key(), lines: [{ variantId: v, quantity: 1 }], contact: { name: 'Late', phone: '0733000000' } }))
      .rejects.toMatchObject({ code: 'insufficient_stock' })
    // The guest's phone found/created a single customer record.
    expect(await prisma.customer.count({ where: { phone: '254712345678' } })).toBe(1)
  })
})

describe('orders lifecycle', () => {
  it('completing converts the reservation into one deduction; cancelling releases it', async () => {
    const p = await shoe(A.manager, { qty: 4, sizes: ['44'] })
    const v = p.variants[0]!.id
    const a = await createOrder(A.manager, { mode: 'manual', channel: 'INSTAGRAM', idempotencyKey: key(), lines: [{ variantId: v, quantity: 2 }], contact: { name: 'IG', phone: '0700111222' } })
    const b = await createOrder(A.manager, { mode: 'manual', channel: 'WHATSAPP', idempotencyKey: key(), lines: [{ variantId: v, quantity: 1 }], contact: { name: 'WA', phone: '0700111333' } })
    expect(await balance(v)).toMatchObject({ onHand: 4, reserved: 3 })

    await transitionOrder(A.manager, a.id, 'PROCESSING')
    await transitionOrder(A.manager, a.id, 'READY')
    const done = await transitionOrder(A.manager, a.id, 'COMPLETED')
    expect(done.paymentStatus).toBe('UNPAID') // fulfilment never implies payment
    expect(await balance(v)).toMatchObject({ onHand: 2, reserved: 1 })
    await expect(transitionOrder(A.manager, a.id, 'CANCELLED')).rejects.toMatchObject({ code: 'invalid_transition' })

    await expect(transitionOrder(A.cashier, b.id, 'CANCELLED')).rejects.toMatchObject({ code: 'forbidden' })
    await transitionOrder(A.manager, b.id, 'CANCELLED', 'customer changed mind')
    expect(await balance(v)).toMatchObject({ onHand: 2, reserved: 0 })
    expect(await prisma.inventoryMovement.count({ where: { referenceId: a.id, type: 'SALE' } })).toBe(1)
  })

  it('refuses to cancel orders with recorded payments', async () => {
    const p = await shoe(A.manager, { qty: 1, sizes: ['45'] })
    const o = await createOrder(A.manager, { mode: 'manual', channel: 'PHONE', idempotencyKey: key(), lines: [{ variantId: p.variants[0]!.id, quantity: 1 }], contact: { name: 'P', phone: '0700999888' } })
    await recordPayment(A.manager, o.id, { methodId: (await method('BANK')).id, amount: 1000, reference: 'BNK1' })
    await expect(transitionOrder(A.manager, o.id, 'CANCELLED')).rejects.toMatchObject({ code: 'payments_outstanding' })
  })

  it('expires stale website reservations', async () => {
    const p = await shoe(A.manager, { qty: 2, sizes: ['35'] })
    const v = p.variants[0]!.id
    const o = await createOrder(guest, { mode: 'web', idempotencyKey: key(), lines: [{ variantId: v, quantity: 2 }], contact: { name: 'Slow', email: 'slow@example.com' } })
    expect((await balance(v)).reserved).toBe(2)
    const n = await expireStaleReservations(systemActor, new Date(Date.now() + 1000 * 3_600_000))
    expect(n).toBeGreaterThanOrEqual(1)
    expect((await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe('CANCELLED')
    expect(await balance(v)).toMatchObject({ onHand: 2, reserved: 0 })
  })
})

describe('returns, exchanges and shifts', () => {
  it('restocks only saleable items, caps quantities, and refunds within what was paid', async () => {
    const p = await shoe(A.manager, { qty: 5, sizes: ['36'] })
    const v = p.variants[0]!.id
    const cash = await method('CASH')
    const sale = await createOrder(A.manager, { mode: 'pos', idempotencyKey: key(), shiftId, lines: [{ variantId: v, quantity: 3 }], payments: [{ methodId: cash.id, amount: 1500000 }] })
    const item = sale.items[0]!
    expect((await balance(v)).onHand).toBe(2)

    await expect(createReturn(A.cashier, { orderId: sale.id, idempotencyKey: key(), reason: 'x', resolution: 'REFUND', items: [{ orderItemId: item.id, quantity: 1, condition: 'SALEABLE' }] }))
      .rejects.toMatchObject({ code: 'forbidden' })

    const k = key()
    const r1 = await createReturn(A.manager, { orderId: sale.id, idempotencyKey: k, reason: 'Too small', resolution: 'REFUND', shiftId, items: [{ orderItemId: item.id, quantity: 1, condition: 'SALEABLE' }], refund: { methodId: cash.id, amount: 500000 } })
    await createReturn(A.manager, { orderId: sale.id, idempotencyKey: k, reason: 'Too small', resolution: 'REFUND', shiftId, items: [{ orderItemId: item.id, quantity: 1, condition: 'SALEABLE' }], refund: { methodId: cash.id, amount: 500000 } })
    expect(r1.creditAmount).toBe(500000)
    expect((await balance(v)).onHand).toBe(3) // restocked once

    await createReturn(A.manager, { orderId: sale.id, idempotencyKey: key(), reason: 'Torn', resolution: 'REFUND', shiftId, items: [{ orderItemId: item.id, quantity: 1, condition: 'DAMAGED' }], refund: { methodId: cash.id, amount: 500000 } })
    expect((await balance(v)).onHand).toBe(3) // damaged goods do not become sellable

    await expect(createReturn(A.manager, { orderId: sale.id, idempotencyKey: key(), reason: 'More', resolution: 'REFUND', items: [{ orderItemId: item.id, quantity: 2, condition: 'SALEABLE' }] }))
      .rejects.toMatchObject({ code: 'return_exceeds_purchase' })

    const r3 = await createReturn(A.manager, { orderId: sale.id, idempotencyKey: key(), reason: 'Check', resolution: 'NO_REFUND', items: [{ orderItemId: item.id, quantity: 1, condition: 'NEEDS_INSPECTION' }] })
    expect((await balance(v)).onHand).toBe(3)
    await resolveInspection(A.manager, r3.items[0]!.id, true)
    expect((await balance(v)).onHand).toBe(4)

    const order = await prisma.order.findUniqueOrThrow({ where: { id: sale.id } })
    expect(order).toMatchObject({ amountReturned: 1500000, amountRefunded: 1000000, status: 'COMPLETED' })
    expect(order.paymentStatus).toBe('PARTIALLY_REFUNDED')
  })

  it('cannot refund more than was paid', async () => {
    const p = await shoe(A.manager, { qty: 2, sizes: ['37'] })
    const sale = await createOrder(A.manager, { mode: 'pos', idempotencyKey: key(), lines: [{ variantId: p.variants[0]!.id, quantity: 1 }] }) // unpaid
    await expect(createReturn(A.manager, { orderId: sale.id, idempotencyKey: key(), reason: 'x', resolution: 'REFUND', items: [{ orderItemId: sale.items[0]!.id, quantity: 1, condition: 'SALEABLE' }], refund: { methodId: (await method('CASH')).id, amount: 1 } }))
      .rejects.toMatchObject({ code: 'refund_exceeds_credit' })
    // The failed transaction left nothing behind.
    expect((await prisma.orderItem.findUniqueOrThrow({ where: { id: sale.items[0]!.id } })).returnedQty).toBe(0)
    expect(await prisma.return.count({ where: { orderId: sale.id } })).toBe(0)
  })

  it('exchanges move credit to a new sale and collect the difference', async () => {
    const small = await shoe(A.manager, { qty: 2, sizes: ['38'], name: 'Exchange A' })
    const big = await shoe(A.manager, { qty: 2, sizes: ['39'], name: 'Exchange B' })
    const card = await method('CARD')
    const sale = await createOrder(A.manager, { mode: 'pos', idempotencyKey: key(), lines: [{ variantId: small.variants[0]!.id, quantity: 1 }], payments: [{ methodId: card.id, amount: 500000 }] })
    const ret = await createReturn(A.manager, {
      orderId: sale.id, idempotencyKey: key(), reason: 'Wrong size', resolution: 'EXCHANGE',
      items: [{ orderItemId: sale.items[0]!.id, quantity: 1, condition: 'SALEABLE' }],
      exchange: { lines: [{ variantId: big.variants[0]!.id, quantity: 2 }], payments: [{ methodId: card.id, amount: 500000 }] },
    })
    const newOrder = await prisma.order.findUniqueOrThrow({ where: { exchangeFromReturnId: ret.id } })
    expect(newOrder).toMatchObject({ total: 1000000, amountPaid: 1000000, paymentStatus: 'PAID' })
    expect((await balance(small.variants[0]!.id)).onHand).toBe(2)
    expect((await balance(big.variants[0]!.id)).onHand).toBe(0)
    expect((await prisma.order.findUniqueOrThrow({ where: { id: sale.id } })).paymentStatus).toBe('REFUNDED')
  })

  it('reconciles the cash drawer', async () => {
    await addCashMovement(A.cashier, shiftId, { type: 'PAY_OUT', amount: 20000, reason: 'Tissue paper' })
    const s = await shiftSummary(prisma, shiftId)
    // opening 1,000 + cash sales − cash refunds − pay-out
    expect(s.expectedCash).toBe(100000 + s.cashSales - s.cashRefunds - 20000)
    expect(s.cashRefunds).toBe(1000000)
    await expect(closeShift(A.cashier, shiftId, { countedCash: s.expectedCash - 100 })).rejects.toMatchObject({ code: 'notes_required' })
    const closed = await closeShift(A.cashier, shiftId, { countedCash: s.expectedCash - 100, notes: 'short by 1' })
    expect(closed.difference).toBe(-100)
    await expect(closeShift(A.cashier, shiftId, { countedCash: 0 })).rejects.toMatchObject({ code: 'shift_closed' })
  })
})
