<script setup lang="ts">
import { Check, Download, History, Pencil, X } from 'lucide-vue-next'

definePageMeta({ layout: 'admin' })
useHead({ title: 'Stock' })

const route = useRoute()
const router = useRouter()
const { can, canAny } = useStaff()
const { money } = useFormat()
const { run, pending } = useAction()

const filter = ref(['all', 'in', 'low', 'out'].includes(String(route.query.filter)) ? String(route.query.filter) : 'all')
const q = ref('')
const categoryId = ref('')
const page = ref(1)
watch([q, categoryId, filter], () => (page.value = 1))
watch(filter, f => router.replace({ query: { ...route.query, filter: f === 'all' ? undefined : f } }))

const { data: categories } = useFetch('/api/admin/categories', { server: false })
const { data, error, status, refresh } = useFetch('/api/admin/inventory/stock', {
  server: false,
  query: computed(() => ({ q: q.value || undefined, categoryId: categoryId.value || undefined, filter: filter.value, page: page.value, pageSize: 25 })),
})
const showCost = computed(() => canAny('reports.inventory', 'reports.financial'))

const editing = ref<string | null>(null)
const threshold = ref(0)
function startEdit(variantId: string, current: number) {
  editing.value = variantId
  threshold.value = current
}
async function saveThreshold(variantId: string) {
  if (!Number.isInteger(threshold.value) || threshold.value < 0) return
  if (await run(() => apiFetch(`/api/admin/inventory/${variantId}/threshold`, { method: 'PUT', body: { threshold: threshold.value } }), { success: 'Threshold updated' })) {
    editing.value = null
    refresh()
  }
}
const tone = (r: { available: number, lowStockThreshold: number }) => (r.available <= 0 ? 'danger' : r.available <= r.lowStockThreshold ? 'warning' : 'success') as 'danger' | 'warning' | 'success'
</script>

<template>
  <div>
    <UiPageHeader title="Stock" subtitle="Available = on hand − reserved for open orders. Every change is recorded in the movement ledger." :crumbs="[{ label: 'Inventory' }, { label: 'Stock' }]">
      <a v-if="canAny('reports.inventory')" class="inline-flex h-11 items-center gap-2 rounded-full border border-sand-200 bg-white/90 px-5 text-sm font-medium text-ink shadow-lift hover:bg-white" :href="`/api/admin/reports/export/stock?filter=${filter}`" download><Download class="size-4" aria-hidden="true" />Export CSV</a>
    </UiPageHeader>

    <section class="glass-card p-5">
      <div class="mb-4 flex flex-wrap items-center gap-2">
        <UiTabs v-model="filter" label="Stock filter" :tabs="[{ value: 'all', label: 'All' }, { value: 'in', label: 'In stock' }, { value: 'low', label: 'Low' }, { value: 'out', label: 'Out' }]" />
        <UiSearchInput v-model="q" placeholder="Search SKU, barcode, product…" class="w-full sm:w-64" />
        <label class="sr-only" for="s-cat">Category</label>
        <select id="s-cat" v-model="categoryId" class="h-10 rounded-full border border-sand-200 bg-sand-50 px-4 text-sm">
          <option value="">All categories</option>
          <option v-for="c in categories ?? []" :key="c.id" :value="c.id">{{ c.parentId ? '— ' : '' }}{{ c.name }}</option>
        </select>
      </div>

      <UiErrorState v-if="error" :error="error" @retry="refresh()" />
      <UiSkeleton v-else-if="status === 'pending' && !data" :rows="8" />
      <UiEmpty v-else-if="!data?.items.length" title="Nothing here" message="No variants match these filters." />
      <template v-else>
        <div class="overflow-x-auto">
          <table class="sg-table min-w-[860px]">
            <thead>
              <tr><th>Product</th><th>SKU</th><th class="text-right">On hand</th><th class="text-right">Reserved</th><th class="text-right">Available</th><th>Low at</th><th v-if="showCost" class="text-right">Avg cost</th><th v-if="showCost" class="text-right">Value</th><th /></tr>
            </thead>
            <tbody>
              <tr v-for="r in data.items" :key="r.variantId">
                <td>
                  <NuxtLink :to="`/admin/products/${r.productId}`" class="flex items-center gap-3">
                    <UiProductImage :image-key="r.imageKey" :alt="r.productName" class="size-9 shrink-0" rounded="rounded-lg" />
                    <span class="min-w-0"><span class="block truncate font-medium hover:underline">{{ r.productName }}</span><span class="block text-xs text-ink-muted">{{ r.title }} · {{ r.category }}</span></span>
                  </NuxtLink>
                </td>
                <td class="font-mono text-xs">{{ r.sku }}</td>
                <td class="num text-right">{{ r.onHand }}</td>
                <td class="num text-right text-ink-soft">{{ r.reserved }}</td>
                <td class="text-right"><UiBadge :tone="tone(r)">{{ r.available }}</UiBadge></td>
                <td>
                  <form v-if="editing === r.variantId" class="flex items-center gap-1" @submit.prevent="saveThreshold(r.variantId)">
                    <label :for="`t-${r.variantId}`" class="sr-only">Low stock threshold</label>
                    <input :id="`t-${r.variantId}`" v-model.number="threshold" type="number" min="0" class="field h-8 w-20" autofocus>
                    <UiIconButton :icon="Check" label="Save threshold" size="sm" :class="pending ? 'opacity-50' : ''" @click="saveThreshold(r.variantId)" />
                    <UiIconButton :icon="X" label="Cancel" size="sm" @click="editing = null" />
                  </form>
                  <span v-else class="flex items-center gap-1">
                    <span class="num">{{ r.lowStockThreshold }}</span>
                    <UiIconButton v-if="can('inventory.adjust')" :icon="Pencil" :label="`Edit threshold for ${r.sku}`" size="sm" @click="startEdit(r.variantId, r.lowStockThreshold)" />
                  </span>
                </td>
                <td v-if="showCost" class="num text-right">{{ money(r.avgCost) }}</td>
                <td v-if="showCost" class="num text-right">{{ r.avgCost == null ? '—' : money(r.avgCost * r.onHand) }}</td>
                <td class="text-right"><UiIconButton :icon="History" :to="`/admin/inventory/movements?variantId=${r.variantId}`" :label="`Movement history for ${r.sku}`" size="sm" /></td>
              </tr>
            </tbody>
          </table>
        </div>
        <UiPagination v-model:page="page" :total="data.total" :page-size="25" />
      </template>
    </section>
  </div>
</template>
