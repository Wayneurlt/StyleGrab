<script setup lang="ts">
import type { reconciliationReport } from '~~/server/services/reports'
import { Download, ShieldAlert } from 'lucide-vue-next'
import { CHANNEL_LABELS } from '#shared/labels'

definePageMeta({ layout: 'admin' })
useHead({ title: 'Reconciliation' })

const { money, date, today } = useFormat()
const from = ref(`${today().slice(0, 7)}-01`)
const to = ref(today())
const { data, error, status, refresh } = useFetch<Awaited<ReturnType<typeof reconciliationReport>>>('/api/admin/reports/reconciliation', { query: computed(() => ({ from: from.value, to: to.value })), server: false })
const exportUrl = computed(() => `/api/admin/reports/export/reconciliation?from=${from.value}&to=${to.value}`)
</script>

<template>
  <div>
    <UiPageHeader title="Reconciliation" subtitle="Recorded sales against recorded payments, refunds and cash drawers." :crumbs="[{ label: 'Reports' }, { label: 'Reconciliation' }]">
      <UiButton variant="light" :icon="Download" :to="exportUrl" external>Export CSV</UiButton>
    </UiPageHeader>

    <div class="mb-5 flex items-start gap-3 rounded-2xl border border-caution/30 bg-caution-tint/80 p-4 text-sm text-ink" role="note">
      <ShieldAlert class="mt-0.5 size-5 shrink-0 text-caution" aria-hidden="true" />
      <p><b>These are payment records entered by staff.</b> External payments are not independently verified unless marked confirmed. Compare confirmed totals with your M-Pesa, bank and card-terminal statements.</p>
    </div>

    <ReportsRangePicker v-model:from="from" v-model:to="to" class="mb-5" />

    <UiErrorState v-if="error" :error="error" @retry="refresh()" />
    <UiSkeleton v-else-if="status === 'pending' && !data" :rows="4" height="h-24" />
    <div v-else-if="data" class="space-y-5">
      <div class="grid grid-cols-2 gap-3 md:grid-cols-5">
        <ReportsTile accent label="Net sales" :value="money(data.sales.net)" :hint="`${data.sales.orders} completed orders`" />
        <ReportsTile label="Returns" :value="money(data.sales.returns)" />
        <ReportsTile label="Payments confirmed" :value="money(data.totals.confirmed)" />
        <ReportsTile label="Awaiting confirmation" :value="money(data.totals.pending)" />
        <ReportsTile label="Refunds" :value="money(data.totals.refunded)" />
      </div>

      <UiCard title="By payment method" subtitle="Payments by date received; refunds by date issued">
        <UiEmpty v-if="!data.byMethod.length" title="No payments recorded in this range" />
        <div v-else class="overflow-x-auto">
          <table class="sg-table min-w-[640px]">
            <thead><tr><th>Method</th><th class="text-right">Confirmed</th><th class="text-right">Awaiting</th><th class="text-right">Failed / voided</th><th class="text-right">Refunded</th><th class="text-right">Records</th></tr></thead>
            <tbody>
              <tr v-for="m in data.byMethod" :key="m.methodId">
                <td class="font-medium">{{ m.name }}</td>
                <td class="num text-right">{{ money(m.confirmed) }}</td>
                <td class="num text-right" :class="m.pending ? 'text-caution' : ''">{{ money(m.pending) }}</td>
                <td class="num text-right text-ink-muted">{{ money(m.failed) }}</td>
                <td class="num text-right">{{ money(m.refunded) }}</td>
                <td class="num text-right">{{ m.count }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </UiCard>

      <UiCard title="Cash shifts" subtitle="Shifts opened in this range">
        <UiEmpty v-if="!data.shifts.length" title="No shifts" />
        <div v-else class="overflow-x-auto">
          <table class="sg-table min-w-[760px]">
            <thead><tr><th>Register</th><th>Opened</th><th>Closed</th><th class="text-right">Opening</th><th class="text-right">Expected</th><th class="text-right">Counted</th><th class="text-right">Difference</th></tr></thead>
            <tbody>
              <tr v-for="s in data.shifts" :key="s.id">
                <td><p class="font-medium">{{ s.register.name }}</p><p class="text-xs text-ink-muted">{{ s.openedBy }}</p></td>
                <td class="whitespace-nowrap text-ink-soft">{{ date(s.openedAt) }}</td>
                <td class="whitespace-nowrap text-ink-soft">{{ s.closedAt ? date(s.closedAt) : '' }}<UiBadge v-if="s.status === 'OPEN'" tone="success">Open</UiBadge></td>
                <td class="num text-right">{{ money(s.openingCash) }}</td>
                <td class="num text-right">{{ s.expectedCash == null ? '—' : money(s.expectedCash) }}</td>
                <td class="num text-right">{{ s.countedCash == null ? '—' : money(s.countedCash) }}</td>
                <td class="num text-right font-medium" :class="(s.difference ?? 0) < 0 ? 'text-negative' : (s.difference ?? 0) > 0 ? 'text-caution' : ''">{{ s.difference == null ? '—' : money(s.difference) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </UiCard>

      <UiCard title="Outstanding balances" subtitle="All open balances (not limited to the range), oldest first">
        <UiEmpty v-if="!data.outstanding.length" title="No outstanding balances" />
        <div v-else class="overflow-x-auto">
          <table class="sg-table min-w-[600px]">
            <thead><tr><th>Order</th><th>Customer</th><th>Channel</th><th>Placed</th><th class="text-right">Total</th><th class="text-right">Due</th></tr></thead>
            <tbody>
              <tr v-for="o in data.outstanding" :key="o.id">
                <td class="font-medium"><NuxtLink :to="`/admin/orders/${o.id}`">{{ o.number }}</NuxtLink></td>
                <td>{{ o.name ?? 'Walk-in' }}</td>
                <td>{{ CHANNEL_LABELS[o.channel] }}</td>
                <td class="whitespace-nowrap text-ink-soft">{{ date(o.placedAt, false) }}</td>
                <td class="num text-right">{{ money(o.total) }}</td>
                <td class="num text-right font-medium text-negative">{{ money(o.due) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </UiCard>
    </div>
  </div>
</template>
