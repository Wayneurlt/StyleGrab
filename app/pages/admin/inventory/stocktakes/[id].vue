<script setup lang="ts">
import { ScanBarcode } from 'lucide-vue-next'

definePageMeta({ layout: 'admin' })

const route = useRoute()
const id = computed(() => String(route.params.id))
const { can } = useStaff()
const { date } = useFormat()
const toast = useToast()
const { pending, run } = useAction()
const { confirm } = useConfirm()
const { data: st, error, status, refresh } = useFetch(() => `/api/admin/inventory/stocktakes/${id.value}`, { server: false })
useHead({ title: computed(() => (st.value ? `${st.value.number} · ${st.value.name}` : 'Stocktake')) })

const editable = computed(() => st.value?.status === 'IN_PROGRESS' && can('inventory.stocktake'))
/** Local edits keyed by variantId; undefined = untouched, null = cleared. */
const counts = ref<Record<string, number | null>>({})
const dirty = ref(new Set<string>())
watch(st, (v) => {
  if (!v) return
  counts.value = Object.fromEntries(v.items.map(i => [i.variantId, i.countedQty]))
  dirty.value = new Set()
}, { immediate: true })

function setCount(variantId: string, raw: string) {
  const n = raw.trim() === '' ? null : Number(raw)
  if (n != null && (!Number.isInteger(n) || n < 0)) return
  counts.value[variantId] = n
  dirty.value.add(variantId)
  dirty.value = new Set(dirty.value)
}

const q = ref('')
const view = ref('all')
const rows = computed(() => {
  const term = q.value.trim().toLowerCase()
  return (st.value?.items ?? []).filter((i) => {
    const c = counts.value[i.variantId]
    if (view.value === 'uncounted' && c != null) return false
    if (view.value === 'diff' && (c == null || c === i.expectedQty)) return false
    if (!term) return true
    return i.variant.sku.toLowerCase().includes(term) || i.variant.product.name.toLowerCase().includes(term) || i.variant.title.toLowerCase().includes(term) || i.variant.barcode === q.value.trim()
  })
})
const stats = computed(() => {
  const items = st.value?.items ?? []
  const counted = items.filter(i => counts.value[i.variantId] != null)
  return { total: items.length, counted: counted.length, diffs: counted.filter(i => counts.value[i.variantId] !== i.expectedQty).length }
})

// Scan mode: each scan adds one to that variant's count.
const scan = ref('')
const scanInput = ref<HTMLInputElement | null>(null)
function onScan() {
  const code = scan.value.trim()
  scan.value = ''
  if (!code) return
  const item = st.value?.items.find(i => i.variant.barcode === code || i.variant.sku.toLowerCase() === code.toLowerCase())
  if (!item) {
    toast.error(`“${code}” is not part of this count`)
    return
  }
  setCount(item.variantId, String((counts.value[item.variantId] ?? 0) + 1))
  toast.info(`${item.variant.sku}: ${counts.value[item.variantId]}`)
}

async function save(silent = false) {
  const changed = [...dirty.value].map(variantId => ({ variantId, countedQty: counts.value[variantId] ?? null }))
  if (!changed.length) return true
  for (let i = 0; i < changed.length; i += 500) {
    const ok = await run(() => apiFetch(`/api/admin/inventory/stocktakes/${id.value}/counts`, { method: 'PUT', body: { counts: changed.slice(i, i + 500) } }))
    if (!ok) return false
  }
  dirty.value = new Set()
  if (!silent) toast.success(`Saved ${changed.length} count${changed.length === 1 ? '' : 's'}`)
  return true
}

async function act(action: 'submit' | 'finalize' | 'cancel') {
  const opts = {
    submit: { title: 'Submit for review?', message: `${stats.value.counted} of ${stats.value.total} lines counted. Uncounted lines will be left unchanged. Counts are locked after submitting.`, confirmLabel: 'Submit' },
    finalize: { title: 'Finalize and post adjustments?', message: `${stats.value.diffs} discrepanc${stats.value.diffs === 1 ? 'y' : 'ies'} will be posted to the stock ledger. This cannot be undone.`, confirmLabel: 'Finalize', danger: true },
    cancel: { title: 'Cancel this stocktake?', message: 'No stock will change. Recorded counts are kept for reference.', confirmLabel: 'Cancel stocktake', danger: true },
  }[action]
  if (action === 'submit' && !(await save(true))) return
  if (!(await confirm(opts))) return
  const res = await run(() => apiFetch<{ adjustedLines?: number }>(`/api/admin/inventory/stocktakes/${id.value}/${action}`, { method: 'POST' }))
  if (res) {
    toast.success(action === 'finalize' ? `Finalized — ${res.adjustedLines ?? 0} line(s) adjusted` : action === 'submit' ? 'Submitted for review' : 'Stocktake cancelled')
    refresh()
  }
}

onBeforeRouteLeave(async () => {
  if (dirty.value.size && !(await confirm({ title: 'Leave without saving?', message: `${dirty.value.size} count(s) haven't been saved.`, confirmLabel: 'Leave', danger: true }))) return false
})
const statusLabel = (s: string) => ({ IN_PROGRESS: 'In progress', SUBMITTED: 'Submitted for review', FINALIZED: 'Finalized', CANCELLED: 'Cancelled' } as Record<string, string>)[s] ?? s
</script>

<template>
  <div>
    <UiErrorState v-if="error" :error="error" @retry="refresh()" />
    <UiSkeleton v-else-if="status === 'pending' && !st" :rows="8" />
    <template v-else-if="st">
      <UiPageHeader :title="st.name" :subtitle="`${st.number} · started ${date(st.startedAt)}`" :crumbs="[{ label: 'Inventory', to: '/admin/inventory' }, { label: 'Stocktakes', to: '/admin/inventory/stocktakes' }, { label: st.number }]">
        <UiBadge :tone="st.status === 'FINALIZED' ? 'success' : st.status === 'SUBMITTED' ? 'warning' : st.status === 'CANCELLED' ? 'neutral' : 'info'">{{ statusLabel(st.status) }}</UiBadge>
        <template v-if="editable">
          <UiButton variant="light" :loading="pending" :disabled="!dirty.size" @click="save()">Save counts{{ dirty.size ? ` (${dirty.size})` : '' }}</UiButton>
          <UiButton :loading="pending" @click="act('submit')">Submit</UiButton>
        </template>
        <UiButton v-if="st.status === 'SUBMITTED' && can('inventory.stocktake.finalize')" :loading="pending" @click="act('finalize')">Finalize</UiButton>
        <UiButton v-if="(st.status === 'IN_PROGRESS' || st.status === 'SUBMITTED') && can('inventory.stocktake')" variant="ghost" @click="act('cancel')">Cancel count</UiButton>
      </UiPageHeader>

      <div class="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div class="glass-card p-4"><p class="text-[13px] text-ink-soft">Lines counted</p><p class="num mt-1 text-2xl font-semibold">{{ stats.counted }} <span class="text-base text-ink-muted">/ {{ stats.total }}</span></p></div>
        <div class="glass-card p-4"><p class="text-[13px] text-ink-soft">Discrepancies</p><p class="num mt-1 text-2xl font-semibold" :class="stats.diffs ? 'text-caution' : ''">{{ stats.diffs }}</p></div>
        <div class="glass-card p-4"><p class="text-[13px] text-ink-soft">Status</p><p class="mt-1 text-lg font-semibold">{{ statusLabel(st.status) }}</p><p v-if="st.status === 'SUBMITTED' && !can('inventory.stocktake.finalize')" class="text-xs text-ink-muted">A manager will review and finalize.</p></div>
      </div>

      <section class="glass-card p-5">
        <div class="mb-4 flex flex-wrap items-center gap-2">
          <form v-if="editable" class="relative w-full sm:w-72" @submit.prevent="onScan">
            <label for="scan" class="sr-only">Scan barcode or type SKU to add one</label>
            <ScanBarcode class="pointer-events-none absolute left-3.5 top-3 size-4 text-ink-muted" aria-hidden="true" />
            <input id="scan" ref="scanInput" v-model="scan" class="field pl-10" placeholder="Scan to count +1" autocomplete="off">
          </form>
          <UiSearchInput v-model="q" placeholder="Filter lines" class="w-full sm:w-56" :debounce="100" />
          <UiTabs v-model="view" label="Show" :tabs="[{ value: 'all', label: 'All' }, { value: 'uncounted', label: 'Uncounted' }, { value: 'diff', label: 'Discrepancies' }]" />
        </div>
        <UiEmpty v-if="!rows.length" title="No lines match" />
        <div v-else class="overflow-x-auto">
          <table class="sg-table min-w-[700px]">
            <thead><tr><th>Item</th><th>SKU</th><th class="text-right">Expected</th><th>Counted</th><th class="text-right">Difference</th></tr></thead>
            <tbody>
              <tr v-for="i in rows" :key="i.id">
                <td><span class="block font-medium">{{ i.variant.product.name }}</span><span class="text-xs text-ink-muted">{{ i.variant.title }}</span></td>
                <td class="font-mono text-xs">{{ i.variant.sku }}</td>
                <td class="num text-right">{{ i.expectedQty }}</td>
                <td class="w-32">
                  <label :for="`cnt-${i.id}`" class="sr-only">Counted quantity for {{ i.variant.sku }}</label>
                  <input v-if="editable" :id="`cnt-${i.id}`" :value="counts[i.variantId] ?? ''" type="number" min="0" inputmode="numeric" class="field h-9" :class="dirty.has(i.variantId) ? 'border-accent/60' : ''" @change="setCount(i.variantId, ($event.target as HTMLInputElement).value)">
                  <span v-else class="num">{{ counts[i.variantId] ?? '—' }}</span>
                </td>
                <td class="num text-right font-medium">
                  <template v-if="counts[i.variantId] != null">
                    <span :class="counts[i.variantId]! - i.expectedQty > 0 ? 'text-positive' : counts[i.variantId]! - i.expectedQty < 0 ? 'text-negative' : 'text-ink-muted'">{{ counts[i.variantId]! - i.expectedQty > 0 ? '+' : '' }}{{ counts[i.variantId]! - i.expectedQty }}</span>
                  </template>
                  <span v-else class="text-ink-muted">—</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </div>
</template>
