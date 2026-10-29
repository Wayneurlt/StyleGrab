<script setup lang="ts">
import type { inventoryReport } from '~~/server/services/reports'
import { Download } from 'lucide-vue-next'
import { MOVEMENT_LABELS } from '#shared/labels'

definePageMeta({ layout: 'admin' })
useHead({ title: 'Inventory report' })

const { money, date, today } = useFormat()
const from = ref(`${today().slice(0, 7)}-01`)
const to = ref(today())
const { data, error, status, refresh } = useFetch<Awaited<ReturnType<typeof inventoryReport>>>('/api/admin/reports/inventory', { query: computed(() => ({ from: from.value, to: to.value })), server: false })
</script>

<template>
  <div>
    <UiPageHeader title="Inventory" subtitle="Stock on hand, valuation and what moved in the selected period." :crumbs="[{ label: 'Reports' }, { label: 'Inventory' }]">
      <UiButton variant="light" :icon="Download" to="/api/admin/reports/export/stock" external>Stock CSV</UiButton>
      <UiButton variant="light" :icon="Download" :to="`/api/admin/reports/export/movements?from=${from}&to=${to}`" external>Movements CSV</UiButton>
    </UiPageHeader>
    <ReportsRangePicker v-model:from="from" v-model:to="to" class="mb-5" />

    <UiErrorState v-if="error" :error="error" @retry="refresh()" />
    <UiSkeleton v-else-if="status === 'pending' && !data" :rows="4" height="h-24" />
    <div v-else-if="data" class="space-y-5">
      <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
        <ReportsTile accent label="Stock value" :value="money(data.valuation.value)" hint="On hand × weighted average cost" />
        <ReportsTile label="Units on hand" :value="String(data.valuation.units)" :hint="`${data.valuation.variants} active variants`" />
        <ReportsTile label="Reserved" :value="String(data.valuation.reserved)" hint="Held for open orders" />
        <ReportsTile label="Missing cost" :value="String(data.valuation.missingCost)" hint="Variants in stock with no cost — valued at 0" />
      </div>

      <div class="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <UiCard title="Value by category" subtitle="Current">
          <UiEmpty v-if="!data.byCategory.length" title="No stock" />
          <table v-else class="sg-table">
            <thead><tr><th>Category</th><th class="text-right">Units</th><th class="text-right">Value</th></tr></thead>
            <tbody>
              <tr v-for="c in data.byCategory" :key="c.category"><td class="font-medium">{{ c.category }}</td><td class="num text-right">{{ c.units }}</td><td class="num text-right">{{ money(c.value) }}</td></tr>
            </tbody>
          </table>
        </UiCard>
        <UiCard title="Movements in range">
          <UiEmpty v-if="!data.movements.length" title="No stock movements" />
          <table v-else class="sg-table">
            <thead><tr><th>Type</th><th class="text-right">Movements</th><th class="text-right">On-hand change</th></tr></thead>
            <tbody>
              <tr v-for="m in data.movements" :key="m.type">
                <td class="font-medium">{{ MOVEMENT_LABELS[m.type] ?? m.type }}</td>
                <td class="num text-right">{{ m.moves }}</td>
                <td class="num text-right" :class="m.units < 0 ? 'text-negative' : m.units > 0 ? 'text-positive' : ''">{{ m.units > 0 ? '+' : '' }}{{ m.units }}</td>
              </tr>
            </tbody>
          </table>
        </UiCard>
      </div>

      <UiCard title="Damaged and lost stock">
        <UiEmpty v-if="!data.shrinkage.length" title="Nothing written off in this range" />
        <div v-else class="overflow-x-auto">
          <table class="sg-table min-w-[700px]">
            <thead><tr><th>Date</th><th>Item</th><th>Type</th><th class="text-right">Units</th><th class="text-right">Value</th><th>Reference / notes</th></tr></thead>
            <tbody>
              <tr v-for="s in data.shrinkage" :key="s.id">
                <td class="whitespace-nowrap text-ink-soft">{{ date(s.createdAt) }}</td>
                <td><p class="font-medium">{{ s.variant.product.name }} · {{ s.variant.title }}</p><p class="text-xs text-ink-muted">{{ s.variant.sku }}</p></td>
                <td>{{ MOVEMENT_LABELS[s.type] }}</td>
                <td class="num text-right">{{ -s.qtyOnHand }}</td>
                <td class="num text-right">{{ s.unitCost == null ? '—' : money(-s.qtyOnHand * s.unitCost) }}</td>
                <td class="max-w-[260px] truncate text-ink-soft">{{ [s.referenceLabel, s.notes].filter(Boolean).join(' · ') || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </UiCard>

      <UiCard title="Stocktake discrepancies" subtitle="Finalized counts that differed from expected stock">
        <UiEmpty v-if="!data.discrepancies.length" title="No discrepancies in this range" />
        <div v-else class="overflow-x-auto">
          <table class="sg-table min-w-[640px]">
            <thead><tr><th>Stocktake</th><th>Item</th><th class="text-right">Expected</th><th class="text-right">Counted</th><th class="text-right">Difference</th></tr></thead>
            <tbody>
              <tr v-for="(d, i) in data.discrepancies" :key="i">
                <td><p class="font-medium">{{ d.number }}</p><p class="text-xs text-ink-muted">{{ d.name }} · {{ date(d.finalizedAt, false) }}</p></td>
                <td><p>{{ d.product }} · {{ d.title }}</p><p class="text-xs text-ink-muted">{{ d.sku }}</p></td>
                <td class="num text-right">{{ d.expected }}</td>
                <td class="num text-right">{{ d.counted }}</td>
                <td class="num text-right font-medium" :class="d.counted - d.expected < 0 ? 'text-negative' : 'text-positive'">{{ d.counted - d.expected > 0 ? '+' : '' }}{{ d.counted - d.expected }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </UiCard>
    </div>
  </div>
</template>
