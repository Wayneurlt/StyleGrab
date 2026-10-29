<script setup lang="ts">
import { Ban, CheckCircle2, XCircle } from 'lucide-vue-next'

definePageMeta({ layout: 'admin' })
useHead({ title: 'Payments' })

const route = useRoute()
const router = useRouter()
const { money, date } = useFormat()
const { can } = useStaff()
const { confirm } = useConfirm()

const statusFilter = ref(typeof route.query.status === 'string' ? route.query.status : 'PENDING_CONFIRMATION')
const methodId = ref('')
const q = ref('')
const page = ref(1)
watch([statusFilter, methodId, q], () => {
  page.value = 1
  router.replace({ query: statusFilter.value ? { status: statusFilter.value } : {} })
})

const { data, status, error, refresh } = useFetch('/api/admin/payments', {
  query: computed(() => ({ status: statusFilter.value || undefined, methodId: methodId.value || undefined, q: q.value || undefined, page: page.value, pageSize: 25 })),
  server: false,
})
const { data: methods } = useFetch('/api/admin/payment-methods', { server: false })
const tabs = [
  { value: 'PENDING_CONFIRMATION', label: 'Awaiting confirmation' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'FAILED', label: 'Rejected' },
  { value: 'VOIDED', label: 'Voided' },
  { value: '', label: 'All' },
]

const { run } = useAction()
async function verify(p: { id: string, amount: number, reference: string | null, method: { name: string } }, approve: boolean) {
  const r = approve
    ? await confirm({ title: 'Confirm payment received?', message: `Only confirm after the ${p.method.name} statement shows ${money(p.amount)}${p.reference ? ` with reference ${p.reference}` : ''}.`, confirmLabel: 'Confirm received' })
    : await confirm({ title: 'Reject this payment?', message: 'Use this when it cannot be found on the statement.', confirmLabel: 'Reject', danger: true, requireReason: 'Why was it rejected?' })
  if (!r) return
  if (await run(() => apiFetch(`/api/admin/payments/${p.id}/verify`, { method: 'POST', body: { approve, note: typeof r === 'string' ? r : null } }), { success: approve ? 'Payment confirmed' : 'Payment rejected' })) refresh()
}
async function voidIt(p: { id: string, amount: number }) {
  const r = await confirm({ title: 'Void this payment record?', message: `Removes ${money(p.amount)} from the amount paid. Only for entries made in error.`, confirmLabel: 'Void', danger: true, requireReason: 'Reason for voiding' })
  if (!r) return
  if (await run(() => apiFetch(`/api/admin/payments/${p.id}/void`, { method: 'POST', body: { reason: String(r) } }), { success: 'Payment voided' })) refresh()
}
</script>

<template>
  <div>
    <UiPageHeader title="Payments" subtitle="Payments recorded by staff. M-Pesa and bank references stay “awaiting confirmation” until checked against the statement." :crumbs="[{ label: 'Orders', to: '/admin/orders' }, { label: 'Payments' }]" />
    <UiTabs v-model="statusFilter" :tabs="tabs" label="Payment status" class="mb-4" />
    <UiCard :padded="false">
      <div class="grid grid-cols-1 gap-2 p-4 sm:grid-cols-[2fr_1fr]">
        <UiSearchInput v-model="q" placeholder="Reference or order number" />
        <select v-model="methodId" class="field h-10 rounded-full" aria-label="Payment method">
          <option value="">All methods</option>
          <option v-for="m in methods ?? []" :key="m.id" :value="m.id">{{ m.name }}</option>
        </select>
      </div>
      <div class="px-3 pb-3">
        <UiErrorState v-if="error" :error="error" @retry="refresh()" />
        <UiSkeleton v-else-if="status === 'pending' && !data" />
        <UiEmpty v-else-if="!data?.items.length" :title="statusFilter === 'PENDING_CONFIRMATION' ? 'Nothing waiting for confirmation' : 'No payments found'" />
        <div v-else class="overflow-x-auto">
          <table class="sg-table min-w-[860px]">
            <thead><tr><th>Received</th><th>Order</th><th>Customer</th><th>Method</th><th>Reference</th><th class="text-right">Amount</th><th>Status</th><th><span class="sr-only">Actions</span></th></tr></thead>
            <tbody>
              <tr v-for="p in data.items" :key="p.id">
                <td class="whitespace-nowrap">{{ date(p.receivedAt) }}<span class="block text-xs text-ink-muted">{{ p.recordedBy ?? '' }}</span></td>
                <td class="font-medium"><NuxtLink :to="`/admin/orders/${p.order.id}`" class="hover:underline">{{ p.order.number }}</NuxtLink></td>
                <td>{{ p.order.customer?.name ?? p.order.contactName ?? 'Walk-in' }}</td>
                <td>{{ p.method.name }}</td>
                <td class="font-mono text-xs">{{ p.reference ?? '—' }}</td>
                <td class="num text-right font-medium">{{ money(p.amount) }}</td>
                <td><UiStatusBadge kind="record" :value="p.status" /><span v-if="p.verifiedBy && p.status !== 'PENDING_CONFIRMATION'" class="block text-[11px] text-ink-muted">{{ p.verifiedBy }}</span></td>
                <td class="whitespace-nowrap text-right">
                  <template v-if="p.status === 'PENDING_CONFIRMATION' && can('payments.verify')">
                    <UiIconButton :icon="CheckCircle2" label="Confirm received" size="sm" @click="verify(p, true)" />
                    <UiIconButton :icon="XCircle" label="Reject" size="sm" @click="verify(p, false)" />
                  </template>
                  <UiIconButton v-if="(p.status === 'PENDING_CONFIRMATION' || p.status === 'CONFIRMED') && can('payments.void')" :icon="Ban" label="Void record" size="sm" @click="voidIt(p)" />
                </td>
              </tr>
            </tbody>
          </table>
          <UiPagination v-model:page="page" :total="data.total" :page-size="25" />
        </div>
      </div>
    </UiCard>
  </div>
</template>
