<script setup lang="ts">
import { Search } from 'lucide-vue-next'

/**
 * The search field in the top bar, used as a global search across
 * products, orders and customers. Results respect the user's permissions server-side.
 */
interface Results {
  products: { id: string, name: string, code: string, status: string }[]
  orders: { id: string, number: string, total: number, status: string, contactName: string | null, customer: { name: string } | null }[]
  customers: { id: string, name: string, phone: string | null }[]
}

const q = ref('')
const open = ref(false)
const loading = ref(false)
const results = ref<Results | null>(null)
const { money } = useFormat()
const router = useRouter()
let timer: ReturnType<typeof setTimeout> | undefined
let seq = 0

watch(q, (v) => {
  clearTimeout(timer)
  if (v.trim().length < 2) {
    results.value = null
    return
  }
  timer = setTimeout(async () => {
    const mine = ++seq
    loading.value = true
    try {
      const r = await apiFetch<Results>('/api/admin/search', { query: { q: v.trim() } })
      if (mine === seq) results.value = r
    }
    catch {
      if (mine === seq) results.value = { products: [], orders: [], customers: [] }
    }
    finally {
      if (mine === seq) loading.value = false
    }
  }, 250)
})

const flat = computed(() => [
  ...(results.value?.orders ?? []).map(o => ({ key: `o${o.id}`, to: `/admin/orders/${o.id}`, title: o.number, sub: `${o.customer?.name ?? o.contactName ?? 'Walk-in'} · ${money(o.total)}`, group: 'Orders' })),
  ...(results.value?.products ?? []).map(p => ({ key: `p${p.id}`, to: `/admin/products/${p.id}`, title: p.name, sub: `${p.code} · ${p.status.toLowerCase()}`, group: 'Products' })),
  ...(results.value?.customers ?? []).map(c => ({ key: `c${c.id}`, to: `/admin/customers/${c.id}`, title: c.name, sub: c.phone ?? '', group: 'Customers' })),
])
const active = ref(0)
watch(flat, () => (active.value = 0))

function go(to: string) {
  open.value = false
  q.value = ''
  router.push(to)
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    active.value = Math.min(flat.value.length - 1, active.value + 1)
  }
  else if (e.key === 'ArrowUp') {
    e.preventDefault()
    active.value = Math.max(0, active.value - 1)
  }
  else if (e.key === 'Enter' && flat.value[active.value]) go(flat.value[active.value]!.to)
  else if (e.key === 'Escape') open.value = false
}
</script>

<template>
  <div class="relative" @focusout="(e: FocusEvent) => !(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node) && (open = false)">
    <label class="flex h-11 items-center gap-3 rounded-full border border-sand-200 bg-white pl-1.5 pr-4 shadow-sm transition focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20">
      <span class="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink text-accent-light" aria-hidden="true"><Search class="size-4" /></span>
      <span class="sr-only">Search products, orders and customers</span>
      <input
        v-model="q"
        type="search"
        role="combobox"
        :aria-expanded="open && !!results"
        aria-controls="cmd-results"
        aria-autocomplete="list"
        placeholder="Search orders, products, customers…"
        class="h-full w-full min-w-0 bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
        @focus="open = true"
        @keydown="onKey"
      >
    </label>
    <div v-if="open && (results || loading)" id="cmd-results" role="listbox" class="absolute inset-x-0 top-[52px] z-40 max-h-96 overflow-y-auto rounded-2xl border border-sand-200 bg-white p-1.5 text-sm text-ink shadow-glass">
      <p v-if="loading && !results" class="px-3 py-3 text-ink-muted">Searching…</p>
      <p v-else-if="!flat.length" class="px-3 py-3 text-ink-muted">No matches for “{{ q }}”.</p>
      <template v-for="(r, i) in flat" :key="r.key">
        <p v-if="i === 0 || flat[i - 1]!.group !== r.group" class="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-ink-muted">{{ r.group }}</p>
        <button type="button" role="option" :aria-selected="i === active" class="flex w-full flex-col rounded-xl px-3 py-2 text-left" :class="i === active ? 'bg-sand-50' : 'hover:bg-sand-50'" @mousedown.prevent="go(r.to)" @mouseenter="active = i">
          <span class="font-medium">{{ r.title }}</span>
          <span class="text-xs text-ink-muted">{{ r.sub }}</span>
        </button>
      </template>
    </div>
  </div>
</template>
