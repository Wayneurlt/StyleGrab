<script setup lang="ts">
/**
 * Stacked monthly bars in the reference style: solid ink = cost of goods sold, hatched teal = gross profit
 * (revenue − COGS). When COGS is hidden (no financial permission) the whole bar is revenue.
 */
const props = defineProps<{ months: { month: string, revenue: number, cogs: number | null }[] }>()
const { money } = useFormat()

const max = computed(() => {
  const m = Math.max(0, ...props.months.map(x => x.revenue))
  if (m === 0) return 100
  const mag = 10 ** Math.floor(Math.log10(m))
  return Math.ceil(m / mag) * mag
})
const ticks = computed(() => [5, 4, 3, 2, 1, 0].map(i => (max.value / 5) * i))
const showCogs = computed(() => props.months.some(m => m.cogs != null))
const label = (key: string) => new Date(`${key}-01T00:00:00Z`).toLocaleString('en', { month: 'short', timeZone: 'UTC' })
const short = (minor: number) => {
  const v = minor / 100
  return v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${Math.round(v / 1000)}k` : `${Math.round(v)}`
}
</script>

<template>
  <div class="glass-inner flex h-full flex-col p-4">
    <div class="mb-3 flex items-center justify-between">
      <p class="text-[13px] font-medium">Revenue and cost</p>
      <div class="flex items-center gap-3 text-[11px] text-ink-soft">
        <span class="flex items-center gap-1.5"><span class="hatch size-2.5 rounded-sm" />{{ showCogs ? 'Gross profit' : 'Revenue' }}</span>
        <span v-if="showCogs" class="flex items-center gap-1.5"><span class="size-2.5 rounded-sm bg-ink" />Cost of goods</span>
      </div>
    </div>
    <div class="relative flex flex-1 gap-2">
      <div class="flex flex-col justify-between pb-6 text-[10px] text-ink-muted">
        <span v-for="t in ticks" :key="t" class="num">{{ short(t) }}</span>
      </div>
      <div class="relative flex flex-1 items-end justify-between gap-2 pb-6">
        <div class="pointer-events-none absolute inset-x-0 bottom-6 top-0 flex flex-col justify-between" aria-hidden="true">
          <div v-for="t in ticks" :key="t" class="border-t border-dashed border-ink/10" />
        </div>
        <div v-for="m in months" :key="m.month" class="group relative flex h-full flex-1 flex-col items-center justify-end">
          <div class="flex w-full max-w-[26px] flex-col justify-end overflow-hidden rounded-md" :style="{ height: `${(m.revenue / max) * 100}%` }">
            <div class="hatch w-full rounded-t-md" :style="{ flexGrow: m.cogs != null ? Math.max(m.revenue - m.cogs, 0) : m.revenue, minHeight: m.revenue ? '3px' : '0' }" />
            <div v-if="m.cogs != null && m.cogs > 0" class="w-full rounded-md bg-ink" :style="{ flexGrow: m.cogs }" />
          </div>
          <span class="absolute -bottom-0.5 text-[11px] text-ink-muted">{{ label(m.month) }}</span>
          <div class="pointer-events-none absolute bottom-full z-10 mb-1 hidden whitespace-nowrap rounded-lg bg-ink px-2 py-1 text-[11px] text-white shadow-lift group-hover:block">
            {{ label(m.month) }}: {{ money(m.revenue) }}<template v-if="m.cogs != null"> · COGS {{ money(m.cogs) }}</template>
          </div>
        </div>
      </div>
    </div>
    <p class="sr-only">
      Monthly revenue: <span v-for="m in months" :key="m.month">{{ label(m.month) }} {{ money(m.revenue) }}<template v-if="m.cogs != null">, cost {{ money(m.cogs) }}</template>; </span>
    </p>
  </div>
</template>
