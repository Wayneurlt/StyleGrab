/**
 * Money is represented everywhere as an integer number of minor units (e.g. KES cents).
 * Rounding policy: half away from zero, to the nearest minor unit, applied once per computed amount.
 */

export const MINOR_PER_MAJOR = 100

/** Parse a user-entered major-unit amount ("1,250.5") into minor units without floating-point drift. */
export function parseMoney(input: string | number): number {
  const raw = String(input).trim().replace(/[,\s]/g, '')
  if (!/^-?\d+(\.\d{0,2})?$/.test(raw)) throw new Error(`Invalid amount: ${input}`)
  const negative = raw.startsWith('-')
  const [whole = '0', frac = ''] = raw.replace('-', '').split('.')
  const minor = Number(whole) * MINOR_PER_MAJOR + Number((frac + '00').slice(0, 2))
  if (!Number.isSafeInteger(minor)) throw new Error(`Amount out of range: ${input}`)
  return negative ? -minor : minor
}

/** Major-unit decimal string for form inputs ("1250.50"). */
export function toMajorString(minor: number | null | undefined): string {
  if (minor == null) return ''
  const sign = minor < 0 ? '-' : ''
  const abs = Math.abs(minor)
  return `${sign}${Math.floor(abs / MINOR_PER_MAJOR)}.${String(abs % MINOR_PER_MAJOR).padStart(2, '0')}`
}

export function formatMoney(minor: number | null | undefined, currency = 'KES', opts: { compact?: boolean } = {}): string {
  if (minor == null) return '—'
  const major = minor / MINOR_PER_MAJOR
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency,
    currencyDisplay: 'code',
    minimumFractionDigits: opts.compact ? 0 : 2,
    maximumFractionDigits: opts.compact ? 0 : 2,
  }).format(major).replace(/\u00a0/g, ' ')
}

/** Integer division rounded half away from zero. */
export function divRound(numerator: number, denominator: number): number {
  if (denominator === 0) throw new Error('Division by zero')
  const q = Math.abs(numerator) / Math.abs(denominator)
  return Math.sign(numerator) * Math.sign(denominator) * Math.floor(q + 0.5)
}

/** Percent expressed in basis points (10% = 1000). */
export function percentOf(amount: number, basisPoints: number): number {
  return divRound(amount * basisPoints, 10_000)
}

/**
 * Split `total` across `weights` proportionally so that the parts sum exactly to `total`
 * (largest-remainder method). Used to allocate order-level discounts to lines.
 */
export function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0)
  if (sum === 0) return weights.map((_, i) => (i === 0 ? total : 0))
  const exact = weights.map(w => (total * w) / sum)
  const parts = exact.map(Math.floor)
  let remainder = total - parts.reduce((a, b) => a + b, 0)
  const order = exact.map((e, i) => ({ i, frac: e - Math.floor(e) })).sort((a, b) => b.frac - a.frac)
  for (const { i } of order) {
    if (remainder <= 0) break
    parts[i] = (parts[i] ?? 0) + 1
    remainder -= 1
  }
  return parts
}
