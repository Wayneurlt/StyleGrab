import { formatMoney } from '#shared/money'

/** Formatting in the business currency and timezone (falls back to KES / Africa/Nairobi). */
export function useFormat() {
  const settings = useState<{ currency: string, timezone: string } | null>('staff-settings')
  const store = useState<{ currency: string } | null>('store-business', () => null)
  const currency = computed(() => settings.value?.currency ?? store.value?.currency ?? 'KES')
  const tz = computed(() => settings.value?.timezone ?? 'Africa/Nairobi')

  const money = (minor: number | null | undefined, compact = false) => formatMoney(minor, currency.value, { compact })
  const date = (d: string | Date | null | undefined, withTime = true) => {
    if (!d) return '—'
    return new Intl.DateTimeFormat('en-GB', { timeZone: tz.value, day: '2-digit', month: 'short', year: 'numeric', ...(withTime ? { hour: '2-digit', minute: '2-digit', hour12: true } : {}) }).format(new Date(d))
  }
  const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: tz.value }).format(new Date())
  const daysAgo = (n: number) => {
    const d = new Date(`${today()}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() - n)
    return d.toISOString().slice(0, 10)
  }
  return { money, date, today, daysAgo, currency }
}
