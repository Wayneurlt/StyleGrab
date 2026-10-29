<script setup lang="ts">
import { ScanBarcode } from 'lucide-vue-next'

export interface PickedVariant {
  variantId: string
  productId: string
  productName: string
  title: string
  sku: string
  barcode: string | null
  price: number
  available: number
  imageKey: string | null
  exactMatch: boolean
}

/**
 * Search sellable variants by SKU, barcode or name. Barcode scanners type the code and press Enter:
 * an exact SKU/barcode match is selected immediately and the box is cleared for the next scan.
 */
const props = withDefaults(defineProps<{ placeholder?: string, includeDraft?: boolean, autofocus?: boolean, showStock?: boolean, categoryId?: string | null }>(), { showStock: true })
const emit = defineEmits<{ select: [v: PickedVariant] }>()
const { money } = useFormat()
const toast = useToast()

const q = ref('')
const results = ref<PickedVariant[]>([])
const open = ref(false)
const loading = ref(false)
const active = ref(0)
const input = ref<HTMLInputElement | null>(null)
let timer: ReturnType<typeof setTimeout> | undefined
let seq = 0

async function search(term: string) {
  const mine = ++seq
  loading.value = true
  try {
    const r = await apiFetch<PickedVariant[]>('/api/admin/variants/search', { query: { q: term || undefined, all: props.includeDraft ? '1' : undefined, categoryId: props.categoryId || undefined } })
    if (mine === seq) {
      results.value = r
      active.value = 0
    }
    return r
  }
  catch (e) {
    if (mine === seq) toast.error(apiError(e))
    return []
  }
  finally {
    if (mine === seq) loading.value = false
  }
}

watch(q, (v) => {
  clearTimeout(timer)
  timer = setTimeout(() => search(v.trim()), 200)
})
watch(() => props.categoryId, () => search(q.value.trim()))

function pick(v: PickedVariant) {
  emit('select', v)
  q.value = ''
  open.value = false
  input.value?.focus()
}

async function onEnter() {
  clearTimeout(timer)
  const term = q.value.trim()
  if (!term) return
  const list = results.value.length && !loading.value ? results.value : await search(term)
  const exact = list.find(r => r.exactMatch)
  if (exact) return pick(exact)
  if (list[active.value]) return pick(list[active.value]!)
  toast.error(`No product found for “${term}”`)
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    open.value = true
    active.value = Math.min(results.value.length - 1, active.value + 1)
  }
  else if (e.key === 'ArrowUp') {
    e.preventDefault()
    active.value = Math.max(0, active.value - 1)
  }
  else if (e.key === 'Escape') open.value = false
}

onMounted(() => {
  if (props.autofocus) input.value?.focus()
})
defineExpose({ focus: () => input.value?.focus() })
</script>

<template>
  <div class="relative" @focusout="(e: FocusEvent) => !(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node) && (open = false)">
    <label class="relative flex items-center">
      <span class="sr-only">{{ placeholder ?? 'Search by name, SKU or scan a barcode' }}</span>
      <ScanBarcode class="pointer-events-none absolute left-3.5 size-4 text-ink-muted" aria-hidden="true" />
      <input
        ref="input"
        v-model="q"
        type="search"
        role="combobox"
        :aria-expanded="open"
        aria-autocomplete="list"
        autocomplete="off"
        :placeholder="placeholder ?? 'Search by name, SKU or scan a barcode'"
        class="field pl-10"
        @focus="open = true; !results.length && search(q.trim())"
        @keydown.enter.prevent="onEnter"
        @keydown="onKey"
      >
    </label>
    <div v-if="open && (results.length || loading)" role="listbox" class="absolute inset-x-0 top-12 z-40 max-h-80 overflow-y-auto rounded-2xl border border-sand-200 bg-white/95 p-1.5 shadow-glass backdrop-blur-xl">
      <p v-if="loading && !results.length" class="px-3 py-2 text-sm text-ink-muted">Searching…</p>
      <button
        v-for="(r, i) in results"
        :key="r.variantId"
        type="button"
        role="option"
        :aria-selected="i === active"
        class="flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left text-sm"
        :class="i === active ? 'bg-sand-50' : 'hover:bg-sand-50'"
        @mousedown.prevent="pick(r)"
        @mouseenter="active = i"
      >
        <UiProductImage :image-key="r.imageKey" :alt="r.productName" class="size-9 shrink-0" rounded="rounded-lg" />
        <span class="min-w-0 flex-1">
          <span class="block truncate font-medium">{{ r.productName }} <span class="font-normal text-ink-muted">· {{ r.title }}</span></span>
          <span class="block text-xs text-ink-muted">{{ r.sku }}<template v-if="r.barcode"> · {{ r.barcode }}</template></span>
        </span>
        <span class="text-right">
          <span class="num block font-medium">{{ money(r.price) }}</span>
          <span v-if="showStock" class="block text-xs" :class="r.available > 0 ? 'text-ink-muted' : 'text-negative'">{{ r.available > 0 ? `${r.available} available` : 'Out of stock' }}</span>
        </span>
      </button>
    </div>
  </div>
</template>
