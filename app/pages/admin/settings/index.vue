<script setup lang="ts">
import type { AppSettings } from '~/composables/useStaff'

definePageMeta({ layout: 'admin' })
useHead({ title: 'Settings' })

const { can, load } = useStaff()
const { pending, run } = useAction()
const { data, error, status, refresh } = useFetch<AppSettings>('/api/admin/settings', { server: false })

const form = ref<AppSettings | null>(null)
const discountPct = ref('10')
watch(data, (v) => {
  if (!v) return
  form.value = { ...v }
  discountPct.value = String(v.maxDiscountBpsWithoutOverride / 100)
}, { immediate: true })

const timezones = (() => {
  try {
    return (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? []
  }
  catch {
    return []
  }
})()
const fieldError = ref<string | null>(null)

async function save() {
  if (!form.value) return
  fieldError.value = null
  const pct = Number(discountPct.value)
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return (fieldError.value = 'Discount limit must be between 0 and 100%')
  const body = { ...form.value, maxDiscountBpsWithoutOverride: Math.round(pct * 100) }
  for (const k of ['adjustmentApprovalThreshold', 'reservationHours', 'defaultLowStockThreshold'] as const) {
    if (!Number.isInteger(body[k]) || body[k] < 0) return (fieldError.value = 'Thresholds and hours must be whole numbers')
  }
  const ok = await run(() => apiFetch('/api/admin/settings', { method: 'PUT', body }), { success: 'Settings saved' })
  if (ok) {
    await load(true)
    await refresh()
  }
}
</script>

<template>
  <div>
    <UiPageHeader title="Settings" subtitle="Business details, receipts and operational limits." :crumbs="[{ label: 'Settings' }, { label: 'General' }]" />
    <UiErrorState v-if="error" :error="error" @retry="refresh()" />
    <UiSkeleton v-else-if="status === 'pending' && !form" :rows="6" />
    <form v-else-if="form" class="space-y-5" novalidate @submit.prevent="save">
      <fieldset :disabled="!can('settings.manage')" class="space-y-5">
        <UiCard title="Business">
          <div class="grid gap-4 md:grid-cols-2">
            <UiField id="s-name" label="Business name" required><input id="s-name" v-model="form.businessName" class="field" maxlength="80"></UiField>
            <UiField id="s-phone" label="Contact phone"><input id="s-phone" v-model="form.contactPhone" type="tel" class="field" maxlength="40"></UiField>
            <UiField id="s-email" label="Contact email"><input id="s-email" v-model="form.contactEmail" type="email" class="field" maxlength="120"></UiField>
            <UiField id="s-address" label="Address"><input id="s-address" v-model="form.address" class="field" maxlength="300"></UiField>
            <UiField id="s-currency" label="Currency" hint="ISO code, e.g. KES. Changing it does not convert existing amounts.">
              <input id="s-currency" v-model="form.currency" class="field uppercase" maxlength="3">
            </UiField>
            <UiField id="s-tz" label="Timezone" hint="Used for reports, receipts and day boundaries.">
              <select v-if="timezones.length" id="s-tz" v-model="form.timezone" class="field">
                <option v-for="tz in timezones" :key="tz" :value="tz">{{ tz }}</option>
              </select>
              <input v-else id="s-tz" v-model="form.timezone" class="field">
            </UiField>
          </div>
        </UiCard>

        <UiCard title="Receipts and policies">
          <div class="grid gap-4 md:grid-cols-2">
            <UiField id="s-footer" label="Receipt footer"><textarea id="s-footer" v-model="form.receiptFooter" rows="3" class="field" maxlength="500" /></UiField>
            <UiField id="s-policy" label="Return policy" hint="Printed on receipts and shown on the storefront."><textarea id="s-policy" v-model="form.returnPolicy" rows="3" class="field" maxlength="1000" /></UiField>
          </div>
        </UiCard>

        <UiCard title="Controls">
          <div class="grid gap-4 md:grid-cols-2">
            <UiField id="s-disc" label="Discount limit without manager override (%)" hint="Cashiers with the discount permission can discount up to this share of a sale.">
              <input id="s-disc" v-model="discountPct" type="number" min="0" max="100" step="0.5" class="field num">
            </UiField>
            <UiField id="s-adj" label="Adjustment approval threshold (units)" hint="Adjustments moving more units than this need approval.">
              <input id="s-adj" v-model.number="form.adjustmentApprovalThreshold" type="number" min="0" step="1" class="field num">
            </UiField>
            <UiField id="s-res" label="Website reservation window (hours)" hint="Unconfirmed, unpaid website orders release their stock after this.">
              <input id="s-res" v-model.number="form.reservationHours" type="number" min="1" max="336" step="1" class="field num">
            </UiField>
            <UiField id="s-low" label="Default low-stock threshold" hint="Applied to new variants.">
              <input id="s-low" v-model.number="form.defaultLowStockThreshold" type="number" min="0" step="1" class="field num">
            </UiField>
            <label class="flex items-center gap-3 rounded-2xl bg-sand-50 px-4 py-3 text-sm md:col-span-2">
              <input v-model="form.requireOpenShiftForCash" type="checkbox" class="size-4 accent-ink">
              Require an open cash shift to record POS cash payments and cash refunds
            </label>
          </div>
        </UiCard>
      </fieldset>
      <p v-if="fieldError" class="rounded-xl bg-negative-tint px-3 py-2 text-sm text-negative" role="alert">{{ fieldError }}</p>
      <div v-if="can('settings.manage')" class="flex justify-end"><UiButton type="submit" :loading="pending">Save settings</UiButton></div>
      <p v-else class="text-sm text-ink-muted">You can view these settings but not change them.</p>
    </form>
  </div>
</template>
