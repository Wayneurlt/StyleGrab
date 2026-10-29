<script setup lang="ts">
import { Download, X } from 'lucide-vue-next'
import { MOVEMENT_LABELS } from '#shared/labels'

definePageMeta({ layout: 'admin' })
useHead({ title: 'Stock movements' })

const route = useRoute()
const router = useRouter()
const { canAny } = useStaff()
const { date, money } = useFormat()

const variantId = computed(() => (typeof route.query.variantId === 'string' ? route.query.variantId : ''))
const type = ref('')
const from = ref('')
const to = ref('')
const q = ref('')
const page = ref(1)
watch([type, from, to, q, variantId], () => (page.value = 1))

const { data, error, status, refresh } = useFetch('/api/admin/inventory/movements', {
  server: false,
  query: computed(() => ({ type: type.value || undefined, from: from.value || undefined, to: to.value || undefined, q: q.value || undefined, variantId: variantId.value || undefined, page: page.value, pageSize: 25 })),
})
const variantLabel = computed(() => {
  const m = data.value?.items[0]
  return variantId.value && m ? `${m.variant.product.name} · ${m.variant.title} (${m.variant.sku})` : null
})
const refLink = (m: { referenceType: string | null, referenceId: string | null }) => {
  if (!m.referenceId) return null
  if (m.referenceType === 'order') return `/admin/orders/${m.referenceId}`
  if (m.referenceType === 'stocktake') return `/admin/inventory/stocktakes/${m.referenceId}`
  if (m.referenceType === 'adjustment') return '/admin/inventory/adjustments'
  if (m.referenceType === 'goods_receipt') return '/admin/inventory/receiving'
  return null
}
const signed = (n: number) => (n > 0 ? `+${n}` : n === 0 ? '·' : String(n))
</script>

<template>
  <div>
    <UiPageHeader title="Stock movements" subtitle="The append-only ledger of every stock change. Corrections appear as new entries, never edits." :crumbs="[{ label: 'Inventory', to: '/admin/inventory' }, { label: 'Movements' }]">
      <a v-if="canAny('reports.inventory')" class="inline-flex h-11 items-center gap-2 rounded-full border border-sand-200 bg-white/90 px-5 text-sm font-medium text-ink shadow-lift hover:bg-white" :href="`/api/admin/reports/export/movements?from=${from || '2000-01-01'}${to ? `&to=${to}` : ''}`" download><Download class="size-4" aria-hidden="true" />Export CSV</a>
    </UiPageHeader>

    <section class="glass-card p-5">
      <div v-if="variantId" class="mb-3 flex items-center gap-2 rounded-2xl bg-sand-50 px-3 py-2 text-sm">
        <span>Showing history for <b>{{ variantLabel ?? 'this variant' }}</b></span>
        <UiIconButton :icon="X" label="Clear variant filter" size="sm" @click="router.replace({ query: {} })" />
      </div>
      <div class="mb-4 flex flex-wrap items-end gap-2">
        <UiSearchInput v-model="q" placeholder="SKU, product or reference" class="w-full sm:w-64" />
        <label class="sr-only" for="m-type">Movement type</label>
        <select id="m-type" v-model="type" class="h-10 rounded-full border border-sand-200 bg-sand-50 px-4 text-sm">
          <option value="">All types</option>
          <option v-for="(label, key) in MOVEMENT_LABELS" :key="key" :value="key">{{ label }}</option>
        </select>
        <label class="flex items-center gap-2 text-sm text-ink-soft">From <input v-model="from" type="date" class="h-10 rounded-full border border-sand-200 bg-sand-50 px-3 text-sm"></label>
        <label class="flex items-center gap-2 text-sm text-ink-soft">To <input v-model="to" type="date" class="h-10 rounded-full border border-sand-200 bg-sand-50 px-3 text-sm"></label>
      </div>

      <UiErrorState v-if="error" :error="error" @retry="refresh()" />
      <UiSkeleton v-else-if="status === 'pending' && !data" :rows="8" />
      <UiEmpty v-else-if="!data?.items.length" title="No movements" message="No stock changes match these filters." />
      <template v-else>
        <div class="overflow-x-auto">
          <table class="sg-table min-w-[960px]">
            <thead><tr><th>When</th><th>Type</th><th>Product</th><th class="text-right">On hand Δ</th><th class="text-right">Reserved Δ</th><th class="text-right">After</th><th class="text-right">Unit cost</th><th>Reference</th><th>By</th></tr></thead>
            <tbody>
              <tr v-for="m in data.items" :key="m.id">
                <td class="whitespace-nowrap text-ink-soft">{{ date(m.createdAt) }}</td>
                <td><UiBadge :tone="m.qtyOnHand > 0 ? 'success' : m.qtyOnHand < 0 ? (['DAMAGE', 'LOSS'].includes(m.type) ? 'danger' : 'info') : 'neutral'">{{ MOVEMENT_LABELS[m.type] ?? m.type }}</UiBadge></td>
                <td><span class="block font-medium">{{ m.variant.product.name }}</span><span class="block text-xs text-ink-muted">{{ m.variant.title }} · {{ m.variant.sku }}</span></td>
                <td class="num text-right font-medium" :class="m.qtyOnHand > 0 ? 'text-positive' : m.qtyOnHand < 0 ? 'text-negative' : 'text-ink-muted'">{{ signed(m.qtyOnHand) }}</td>
                <td class="num text-right" :class="m.qtyReserved ? '' : 'text-ink-muted'">{{ signed(m.qtyReserved) }}</td>
                <td class="num whitespace-nowrap text-right text-ink-soft">{{ m.onHandAfter }} / {{ m.reservedAfter }}</td>
                <td class="num text-right">{{ money(m.unitCost) }}</td>
                <td class="max-w-[220px]">
                  <NuxtLink v-if="refLink(m)" :to="refLink(m)!" class="font-medium underline-offset-2 hover:underline">{{ m.referenceLabel ?? 'View' }}</NuxtLink>
                  <span v-else>{{ m.referenceLabel ?? '—' }}</span>
                  <span v-if="m.notes || m.reason" class="block truncate text-xs text-ink-muted" :title="m.notes ?? m.reason ?? ''">{{ m.notes ?? m.reason }}</span>
                </td>
                <td class="text-ink-soft">{{ m.userName ?? 'System' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <UiPagination v-model:page="page" :total="data.total" :page-size="25" />
      </template>
    </section>
  </div>
</template>
