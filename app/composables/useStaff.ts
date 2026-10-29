import type { Permission } from '#shared/permissions'

export interface StaffMe {
  id: string
  email: string
  name: string
  role: { key: string, name: string }
  permissions: string[]
}

export interface AppSettings {
  businessName: string
  currency: string
  timezone: string
  contactPhone: string
  contactEmail: string
  address: string
  receiptFooter: string
  returnPolicy: string
  maxDiscountBpsWithoutOverride: number
  adjustmentApprovalThreshold: number
  reservationHours: number
  defaultLowStockThreshold: number
  requireOpenShiftForCash: boolean
}

/** Signed-in staff member. Permissions here only shape the UI — the server enforces them on every request. */
export function useStaff() {
  const me = useState<StaffMe | null>('staff-me', () => null)
  const settings = useState<AppSettings | null>('staff-settings', () => null)
  const loaded = useState('staff-loaded', () => false)

  async function load(force = false) {
    if (loaded.value && !force) return me.value
    try {
      const [user, s] = await Promise.all([apiFetch<StaffMe>('/api/auth/me'), apiFetch<AppSettings>('/api/admin/settings')])
      me.value = user
      settings.value = s
    }
    catch {
      me.value = null
    }
    loaded.value = true
    return me.value
  }

  function can(...perms: Permission[]) {
    const p = me.value?.permissions ?? []
    return p.includes('*') || perms.every(x => p.includes(x))
  }
  function canAny(...perms: Permission[]) {
    const p = me.value?.permissions ?? []
    return p.includes('*') || perms.some(x => p.includes(x))
  }

  async function logout() {
    await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined)
    me.value = null
    loaded.value = false
    await navigateTo('/admin/login')
  }

  return { me, settings, load, can, canAny, logout }
}
