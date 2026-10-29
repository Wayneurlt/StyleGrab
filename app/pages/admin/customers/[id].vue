<script setup lang="ts">
import { CHANNEL_LABELS } from '#shared/labels'
import { outstanding as outstandingOf } from '~/components/sales/CartLines.vue'

definePageMeta({ layout: 'admin' })

const route = useRoute()
const id = computed(() => String(route.params.id))
const { money, date } = useFormat()
const { can } = useStaff()
const { confirm } = useConfirm()
const { data: c, status, error, refresh } = useFetch(() => `/api/admin/customers/${id.value}`, { server: false })
useHead({ title: () => c.value?.name ?? 'Customer' })

const form = reactive({ name: '', phone: '', email: '', notes: '' })
watch(c, (v) => {
  if (v) Object.assign(form, { name: v.name, phone: v.phone ?? '', email: v.email ?? '', notes: v.notes ?? '' })
}, { immediate: true })
const dirty = computed(() => !!c.value && (form.name !== c.value.name || form.phone !== (c.value.phone ?? '') || form.email !== (c.value.email ?? '') || (can('customers.notes') && form.notes !== (c.value.notes ?? ''))))

const { pending, run } = useAction()
async function save() {
  const body: Record<string, string | null> = { name: form.name, phone: form.phone || null, email: form.email || null }
  if (can('customers.notes')) body.notes = form.notes || null
  if (await run(() => apiFetch(`/api/admin/customers/${id.value}`, { method: 'PUT', body }), { success: 'Customer updated' })) refresh()
}
async function toggleActive() {
  const active = c.value!.isActive
  const ok = await confirm({ title: active ? 'Deactivate customer?' : 'Reactivate customer?', message: active ? 'They will no longer appear in POS/order search and cannot sign in. Order history is kept.' : 'They can be selected for sales again.', confirmLabel: active ? 'Deactivate' : 'Reactivate', danger: active })
  if (!ok) return
  if (await run(() => apiFetch(`/api/admin/customers/${id.value}`, { method: 'PUT', body: { isActive: !active } }), { success: active ? 'Customer deactivated' : 'Customer reactivated' })) refresh()
}
</script>

<template>
  <div>
    <UiErrorState v-if="error" :error="error" @retry="refresh()" />
    <UiSkeleton v-else-if="status === 'pending' && !c" :rows="3" height="h-32" />
    <template v-else-if="c">
      <UiPageHeader :title="c.name" :subtitle="`Customer since ${date(c.createdAt, false)}${c.hasAccount ? ' · has an online account' : ''}`" :crumbs="[{ label: 'Customers', to: '/admin/customers' }, { label: c.name }]">
        <UiBadge :tone="c.isActive ? 'success' : 'neutral'">{{ c.isActive ? 'Active' : 'Inactive' }}</UiBadge>
        <UiButton v-if="can('customers.manage')" variant="light" @click="toggleActive">{{ c.isActive ? 'Deactivate' : 'Reactivate' }}</UiButton>
        <UiButton v-if="can('orders.manage') && c.isActive" to="/admin/orders/new">New order</UiButton>
      </UiPageHeader>

      <div class="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_1.6fr]">
        <div class="min-w-0 space-y-5">
          <div class="grid grid-cols-2 gap-3">
            <div class="accent-card p-4"><p class="text-[13px] text-white/85">Total purchases</p><p class="num mt-4 break-words text-xl font-semibold sm:text-2xl">{{ money(c.totalPurchases) }}</p></div>
            <div class="rounded-3xl border border-sand-200 bg-sand-50 p-4"><p class="text-[13px] text-ink-soft">Outstanding</p><p class="num mt-4 break-words text-xl font-semibold sm:text-2xl" :class="c.outstanding > 0 ? 'text-negative' : ''">{{ money(c.outstanding) }}</p></div>
          </div>
          <UiCard title="Profile">
            <form class="space-y-3" @submit.prevent="save">
              <UiField id="p-name" label="Name" required><input id="p-name" v-model="form.name" class="field" required maxlength="120" :disabled="!can('customers.manage')"></UiField>
              <UiField id="p-phone" label="Phone"><input id="p-phone" v-model="form.phone" class="field" type="tel" maxlength="30" :disabled="!can('customers.manage')"></UiField>
              <UiField id="p-email" label="Email"><input id="p-email" v-model="form.email" class="field" type="email" maxlength="120" :disabled="!can('customers.manage')"></UiField>
              <UiField v-if="can('customers.notes')" id="p-notes" label="Private notes" hint="Staff only — never shown to the customer"><textarea id="p-notes" v-model="form.notes" rows="4" class="field" maxlength="2000" :disabled="!can('customers.manage')" /></UiField>
              <UiButton v-if="can('customers.manage')" type="submit" :loading="pending" :disabled="!dirty || !form.name.trim()">Save changes</UiButton>
            </form>
          </UiCard>
        </div>

        <UiCard title="Order history" :subtitle="`${c.orders.length} most recent orders`">
          <UiEmpty v-if="!c.orders.length" title="No orders yet" />
          <div v-else class="overflow-x-auto">
            <table class="sg-table min-w-[620px]">
              <thead><tr><th>Order</th><th>Date</th><th>Channel</th><th class="text-right">Total</th><th class="text-right">Balance</th><th>Payment</th><th>Fulfilment</th></tr></thead>
              <tbody>
                <tr v-for="o in c.orders" :key="o.id" class="cursor-pointer" @click="navigateTo(`/admin/orders/${o.id}`)">
                  <td class="font-medium"><NuxtLink :to="`/admin/orders/${o.id}`" class="hover:underline" @click.stop>{{ o.number }}</NuxtLink></td>
                  <td class="whitespace-nowrap">{{ date(o.placedAt) }}</td>
                  <td>{{ CHANNEL_LABELS[o.channel] }}</td>
                  <td class="num text-right">{{ money(o.total) }}</td>
                  <td class="num text-right">{{ o.status === 'CANCELLED' ? '—' : money(outstandingOf(o)) }}</td>
                  <td><UiStatusBadge kind="payment" :value="o.paymentStatus" /></td>
                  <td><UiStatusBadge kind="order" :value="o.status" dot /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </UiCard>
      </div>
    </template>
  </div>
</template>
