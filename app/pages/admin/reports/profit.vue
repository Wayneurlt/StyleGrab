<script setup lang="ts">
import type { profitReport } from '~~/server/services/reports'
import { Download, Info } from 'lucide-vue-next'

definePageMeta({ layout: 'admin' })
useHead({ title: 'Profit report' })

const { money, today } = useFormat()
const from = ref(`${today().slice(0, 7)}-01`)
const to = ref(today())
const { data, error, status, refresh } = useFetch<Awaited<ReturnType<typeof profitReport>>>('/api/admin/reports/profit', { query: computed(() => ({ from: from.value, to: to.value })), server: false })
const exportUrl = computed(() => `/api/admin/reports/export/profit?from=${from.value}&to=${to.value}`)
const pct = (m: number | null) => (m == null ? '—' : `${(m * 100).toFixed(1)}%`)
const SHRINK: Record<string, string> = { DAMAGE: 'Damaged', LOSS: 'Lost / stolen' }
</script>

<template>
  <div>
    <UiPageHeader title="Profit" subtitle="Gross profit on completed sales. Revenue is not profit — cost of goods is subtracted." :crumbs="[{ label: 'Reports' }, { label: 'Profit' }]">
      <UiButton variant="light" :icon="Download" :to="exportUrl" external>Export CSV</UiButton>
    </UiPageHeader>
    <ReportsRangePicker v-model:from="from" v-model:to="to" class="mb-5" />

    <UiErrorState v-if="error" :error="error" @retry="refresh()" />
    <UiSkeleton v-else-if="status === 'pending' && !data" :rows="4" height="h-24" />
    <div v-else-if="data" class="space-y-5">
      <div class="grid grid-cols-2 gap-3 md:grid-cols-5">
        <ReportsTile accent label="Gross profit" :value="money(data.totals.grossProfit)" :hint="`Margin ${pct(data.totals.margin)}`" />
        <ReportsTile label="Revenue" :value="money(data.totals.revenue)" hint="All completed sales, net of returns" />
        <ReportsTile label="Costed revenue" :value="money(data.totals.costedRevenue)" hint="Lines with a known cost" />
        <ReportsTile label="Cost of goods sold" :value="money(data.totals.cogs)" />
        <ReportsTile label="Margin" :value="pct(data.totals.margin)" />
      </div>

      <div class="glass-card flex gap-3 p-4 text-sm">
        <Info class="mt-0.5 size-4 shrink-0 text-info" aria-hidden="true" />
        <div class="space-y-1 text-ink-soft">
          <p><b class="text-ink">Costing method: {{ data.method }}.</b> Each sold unit carries the average cost of stock on hand when it was deducted. Returned units reduce both revenue and COGS. Damage and loss are reported separately as shrinkage, not as COGS.</p>
          <p v-if="data.totals.uncostedLines">
            <b class="text-caution">{{ data.totals.uncostedLines }} sold lines ({{ money(data.totals.uncostedRevenue) }} of revenue) had no recorded cost</b> and are excluded from gross profit and margin rather than estimated. Record purchase costs when receiving stock to include them.
          </p>
        </div>
      </div>

      <UiCard title="By category">
        <UiEmpty v-if="!data.categories.length" title="No completed sales in this range" />
        <div v-else class="overflow-x-auto">
          <table class="sg-table min-w-[720px]">
            <thead><tr><th>Category</th><th class="text-right">Units</th><th class="text-right">Revenue</th><th class="text-right">COGS</th><th class="text-right">Gross profit</th><th class="text-right">Margin</th><th class="text-right">Uncosted</th></tr></thead>
            <tbody>
              <tr v-for="c in data.categories" :key="c.categoryId">
                <td class="font-medium">{{ c.category }}</td>
                <td class="num text-right">{{ c.units }}</td>
                <td class="num text-right">{{ money(c.revenue) }}</td>
                <td class="num text-right">{{ money(c.cogs) }}</td>
                <td class="num text-right font-medium">{{ money(c.grossProfit) }}</td>
                <td class="num text-right">{{ pct(c.margin) }}</td>
                <td class="num text-right" :class="c.uncostedLines ? 'text-caution' : 'text-ink-muted'">{{ c.uncostedLines ? `${c.uncostedLines} lines` : '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </UiCard>

      <UiCard title="Shrinkage" subtitle="Stock written off as damaged or lost in this range, valued at average cost">
        <UiEmpty v-if="!data.shrinkage.length" title="No damage or loss recorded" />
        <div v-else class="grid gap-3 sm:grid-cols-2">
          <div v-for="s in data.shrinkage" :key="s.type" class="rounded-2xl bg-sand-50 p-4">
            <p class="text-[13px] text-ink-soft">{{ SHRINK[s.type] ?? s.type }}</p>
            <p class="num mt-2 text-xl font-semibold">{{ money(s.value) }}</p>
            <p class="text-xs text-ink-muted">{{ s.units }} units<template v-if="s.unvalued"> · {{ s.unvalued }} movements without a cost</template></p>
          </div>
        </div>
      </UiCard>
    </div>
  </div>
</template>
