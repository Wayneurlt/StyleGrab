<script setup lang="ts">
import { ChevronDown, ChevronRight } from 'lucide-vue-next'

definePageMeta({ layout: 'admin' })
useHead({ title: 'Audit log' })

const { date, daysAgo, today } = useFormat()
const page = ref(1)
const q = ref('')
const entityType = ref('')
const from = ref(daysAgo(29))
const to = ref(today())
watch([q, entityType, from, to], () => (page.value = 1))

const ENTITY_TYPES = ['order', 'product', 'category', 'variant', 'stock_adjustment', 'goods_receipt', 'stocktake', 'purchase_order', 'supplier', 'customer', 'pos_shift', 'payment_method', 'user', 'role', 'settings', 'import']
const { data, error, status, refresh } = useFetch('/api/admin/audit', {
  query: computed(() => ({ page: page.value, pageSize: 25, q: q.value || undefined, entityType: entityType.value || undefined, from: from.value, to: to.value })),
  server: false,
})
const expanded = ref<Set<string>>(new Set())
function toggle(id: string) {
  const s = new Set(expanded.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  expanded.value = s
}
const pretty = (v: unknown) => JSON.stringify(v, null, 2)
</script>

<template>
  <div>
    <UiPageHeader title="Audit log" subtitle="A read-only record of sensitive actions. Events cannot be edited or deleted." :crumbs="[{ label: 'Settings', to: '/admin/settings' }, { label: 'Audit log' }]" />
    <UiCard>
      <div class="mb-4 flex flex-wrap items-center gap-2">
        <UiSearchInput v-model="q" placeholder="Search action, e.g. payment" class="w-full sm:w-64" />
        <select v-model="entityType" aria-label="Entity type" class="h-10 rounded-full border border-sand-200 bg-sand-50 px-4 text-sm">
          <option value="">All entities</option>
          <option v-for="t in ENTITY_TYPES" :key="t" :value="t">{{ t.replace('_', ' ') }}</option>
        </select>
        <label class="sr-only" for="audit-from">From</label>
        <input id="audit-from" v-model="from" type="date" :max="to" class="h-10 rounded-full border border-sand-200 bg-sand-50 px-3 text-sm">
        <span class="text-sm text-ink-muted">to</span>
        <label class="sr-only" for="audit-to">To</label>
        <input id="audit-to" v-model="to" type="date" :min="from" class="h-10 rounded-full border border-sand-200 bg-sand-50 px-3 text-sm">
      </div>

      <UiErrorState v-if="error" :error="error" @retry="refresh()" />
      <UiSkeleton v-else-if="status === 'pending' && !data" :rows="8" />
      <UiEmpty v-else-if="!data?.items.length" title="No events" message="Try a wider date range." />
      <template v-else>
        <div class="overflow-x-auto">
          <table class="sg-table min-w-[760px]">
            <thead><tr><th class="w-8"><span class="sr-only">Details</span></th><th>When</th><th>Actor</th><th>Action</th><th>Entity</th><th>Reason</th></tr></thead>
            <tbody>
              <template v-for="e in data.items" :key="e.id">
                <tr>
                  <td>
                    <button v-if="e.before || e.after" type="button" class="rounded-full p-1 hover:bg-white" :aria-expanded="expanded.has(e.id)" :aria-label="`Show details for ${e.action}`" @click="toggle(e.id)">
                      <component :is="expanded.has(e.id) ? ChevronDown : ChevronRight" class="size-4" />
                    </button>
                  </td>
                  <td class="whitespace-nowrap text-ink-soft">{{ date(e.createdAt) }}</td>
                  <td class="max-w-[180px] truncate">{{ e.actorLabel ?? 'system' }}</td>
                  <td class="font-mono text-xs">{{ e.action }}</td>
                  <td class="text-xs"><span class="text-ink-muted">{{ e.entityType }}</span><span v-if="e.entityId" class="block font-mono">{{ e.entityId }}</span></td>
                  <td class="max-w-[220px] truncate text-ink-soft">{{ e.reason ?? '' }}</td>
                </tr>
                <tr v-if="expanded.has(e.id)">
                  <td colspan="6">
                    <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div><p class="eyebrow mb-1">Before</p><pre class="max-h-64 overflow-auto rounded-xl bg-white/80 p-3 text-xs">{{ e.before ? pretty(e.before) : '—' }}</pre></div>
                      <div><p class="eyebrow mb-1">After</p><pre class="max-h-64 overflow-auto rounded-xl bg-white/80 p-3 text-xs">{{ e.after ? pretty(e.after) : '—' }}</pre></div>
                    </div>
                    <p v-if="e.ip" class="mt-2 text-xs text-ink-muted">IP {{ e.ip }}</p>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
        <UiPagination v-model:page="page" :total="data.total" :page-size="25" />
      </template>
    </UiCard>
  </div>
</template>
