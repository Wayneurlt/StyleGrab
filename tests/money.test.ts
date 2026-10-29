import { describe, expect, it } from 'vitest'
import { allocate, divRound, parseMoney, percentOf, toMajorString } from '../shared/money'
import { derivePaymentStatus } from '../server/services/payments'
import { returnCredit } from '../server/services/returns'
import { suggestSku } from '../server/services/catalog'

describe('money', () => {
  it('parses major units without float drift', () => {
    expect(parseMoney('1,250.5')).toBe(125050)
    expect(parseMoney('0.1')).toBe(10)
    expect(parseMoney('19.99')).toBe(1999)
    expect(() => parseMoney('1.234')).toThrow()
    expect(() => parseMoney('abc')).toThrow()
    expect(toMajorString(125050)).toBe('1250.50')
  })

  it('rounds half away from zero', () => {
    expect(divRound(5, 2)).toBe(3)
    expect(divRound(-5, 2)).toBe(-3)
    expect(percentOf(999, 1000)).toBe(100) // 99.9 -> 100
  })

  it('allocates exactly', () => {
    const parts = allocate(100, [1, 1, 1])
    expect(parts.reduce((a, b) => a + b, 0)).toBe(100)
    expect(parts.sort()).toEqual([33, 33, 34])
  })

  it('return credits never exceed the line total across partial returns', () => {
    const lineTotal = 1000
    const qty = 3
    const c1 = returnCredit(lineTotal, qty, 0, 1)
    const c2 = returnCredit(lineTotal, qty, 1, 1)
    const c3 = returnCredit(lineTotal, qty, 2, 1)
    expect(c1 + c2 + c3).toBe(lineTotal)
  })
})

describe('payment status derivation', () => {
  const base = { total: 1000, amountPaid: 0, amountPending: 0, amountRefunded: 0, amountReturned: 0 }
  it('is independent of fulfilment and follows recorded amounts', () => {
    expect(derivePaymentStatus(base)).toBe('UNPAID')
    expect(derivePaymentStatus({ ...base, amountPaid: 400 })).toBe('PARTIALLY_PAID')
    expect(derivePaymentStatus({ ...base, amountPending: 1000 })).toBe('AWAITING_CONFIRMATION')
    expect(derivePaymentStatus({ ...base, amountPaid: 600, amountPending: 400 })).toBe('AWAITING_CONFIRMATION')
    expect(derivePaymentStatus({ ...base, amountPaid: 1000 })).toBe('PAID')
    expect(derivePaymentStatus({ ...base, amountPaid: 1000, amountReturned: 300, amountRefunded: 300 })).toBe('PARTIALLY_REFUNDED')
    expect(derivePaymentStatus({ ...base, amountPaid: 1000, amountReturned: 1000, amountRefunded: 1000 })).toBe('REFUNDED')
    expect(derivePaymentStatus({ ...base, total: 0 })).toBe('PAID')
  })
})

describe('sku suggestion', () => {
  it('follows SG-<code>-<attrs>', () => {
    expect(suggestSku('SC-001', ['Black'])).toBe('SG-SC-001-BLA')
    expect(suggestSku('SH-002', ['White', '38'])).toBe('SG-SH-002-WHI-38')
  })
})
