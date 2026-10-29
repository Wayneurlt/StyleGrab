<script setup lang="ts">
import { SlidersHorizontal, X } from 'lucide-vue-next'
import { parseMoney } from '#shared/money'
import type { ProductCard } from '~/composables/useStore'

/** Product listing with URL-synced search, sort, price, availability and attribute filters. */
const props = defineProps<{ category?: string }>()
const route = useRoute()
const router = useRouter()

const query = computed(() => {
  const q: Record<string, string> = {}
  for (const [k, v] of Object.entries(route.query)) if (typeof v === 'string' && v) q[k] = v
  return q
})

const { data, error, status } = await useFetch<{
  total: number, page: number, pageSize: number
  category: { name: string, slug: string, description: string | null } | null
  items: ProductCard[]
  facets: Record<string, { name: string, values: string[] }>
}>('/api/store/products', { query: computed(() => ({ ...query.value, category: props.category })) })

const title = computed(() => data.value?.category?.name ?? (query.value.q ? `Results for “${query.value.q}”` : 'All products'))
useSeoMeta({ title, description: computed(() => data.value?.category?.description || `Shop ${title.value.toLowerCase()} at StyleGrab.`) })
const siteUrl = useRuntimeConfig().public.siteUrl
useHead({ link: [{ rel: 'canonical', href: computed(() => `${siteUrl}${route.path}`) }] })

function setQuery(patch: Record<string, string | undefined>) {
  const next: Record<string, string> = { ...query.value }
  for (const [k, v] of Object.entries(patch)) next[k] = v ?? ''
  if (!('page' in patch)) next.page = ''
  router.push({ query: Object.fromEntries(Object.entries(next).filter(([, v]) => v)) })
}

function toggleAttr(code: string, value: string) {
  const current = (query.value[`attr_${code}`] ?? '').split(',').filter(Boolean)
  const next = current.includes(value) ? current.filter(v => v !== value) : [...current, value]
  setQuery({ [`attr_${code}`]: next.join(',') || undefined })
}
const isOn = (code: string, value: string) => (query.value[`attr_${code}`] ?? '').split(',').includes(value)

const minText = ref(query.value.min ? String(Number(query.value.min) / 100) : '')
const maxText = ref(query.value.max ? String(Number(query.value.max) / 100) : '')
function applyPrice() {
  const conv = (s: string) => {
    try {
      return s.trim() ? String(parseMoney(s)) : undefined
    }
    catch {
      return undefined
    }
  }
  setQuery({ min: conv(minText.value), max: conv(maxText.value) })
}
const page = computed({ get: () => Number(query.value.page ?? 1), set: v => setQuery({ page: v > 1 ? String(v) : undefined }) })
const filtersOpen = ref(false)
const activeFilterCount = computed(() => Object.keys(query.value).filter(k => k.startsWith('attr_') || ['min', 'max', 'inStock'].includes(k)).length)
</script>

<template>
  <div>
    <!-- Page header -->
    <div class="mx-auto max-w-[1200px] px-5 pb-4 pt-14 text-center sm:pt-20">
      <nav aria-label="Breadcrumb" class="text-[12px] text-ink-muted">
        <NuxtLink to="/" class="hover:text-ink">Home</NuxtLink><span class="mx-1.5">›</span><NuxtLink to="/shop" class="hover:text-ink">Shop</NuxtLink><template v-if="data?.category"><span class="mx-1.5">›</span><span aria-current="page" class="text-ink">{{ data.category.name }}</span></template>
      </nav>
      <h1 class="mt-3 animate-fade-up text-5xl font-semibold tracking-[-0.035em] text-ink sm:text-6xl">{{ title }}</h1>
      <p v-if="data?.category?.description" class="mx-auto mt-4 max-w-2xl animate-fade-up text-[19px] text-ink-muted" style="animation-delay: 100ms">{{ data.category.description }}</p>
    </div>

    <div class="mx-auto grid grid-cols-1 max-w-[1200px] gap-8 px-5 pt-8 lg:grid-cols-[230px_1fr]">
      <!-- Filters -->
      <aside class="lg:block" :class="filtersOpen ? 'block' : 'hidden'" aria-label="Filters">
        <div class="space-y-7 rounded-3xl bg-sand-100 p-6 lg:sticky lg:top-24">
          <div class="flex items-center justify-between">
            <h2 class="font-medium">Filters</h2>
            <button v-if="activeFilterCount" type="button" class="text-xs font-medium text-ink-muted hover:text-ink" @click="router.push({ query: query.q ? { q: query.q } : {} })">Clear all</button>
          </div>
          <label class="flex items-center gap-2 text-sm">
            <input type="checkbox" class="size-4 accent-ink" :checked="query.inStock === '1'" @change="setQuery({ inStock: ($event.target as HTMLInputElement).checked ? '1' : undefined })">
            In stock only
          </label>
          <fieldset>
            <legend class="label mb-2">Price</legend>
            <form class="flex items-center gap-2" @submit.prevent="applyPrice">
              <input v-model="minText" inputmode="decimal" placeholder="Min" aria-label="Minimum price" class="field h-9">
              <span class="text-ink-muted">–</span>
              <input v-model="maxText" inputmode="decimal" placeholder="Max" aria-label="Maximum price" class="field h-9">
              <UiButton type="submit" size="sm" variant="light">Go</UiButton>
            </form>
          </fieldset>
          <fieldset v-for="(f, code) in data?.facets" :key="code">
            <legend class="label mb-2">{{ f.name }}</legend>
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="v in f.values"
                :key="v"
                type="button"
                class="rounded-full border px-3 py-1 text-xs font-medium transition"
                :class="isOn(String(code), v) ? 'border-ink bg-ink text-white' : 'border-sand-200 bg-sand-50 hover:bg-white'"
                :aria-pressed="isOn(String(code), v)"
                @click="toggleAttr(String(code), v)"
              >{{ v }}</button>
            </div>
          </fieldset>
        </div>
      </aside>

      <section>
        <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p class="text-sm font-medium text-ink-soft" aria-live="polite">{{ data?.total ?? 0 }} products</p>
          <div class="flex items-center gap-2">
            <UiButton class="lg:hidden" variant="light" size="sm" :icon="filtersOpen ? X : SlidersHorizontal" @click="filtersOpen = !filtersOpen">Filters<span v-if="activeFilterCount"> ({{ activeFilterCount }})</span></UiButton>
            <label for="sort" class="sr-only">Sort by</label>
            <select id="sort" :value="query.sort ?? 'newest'" class="h-9 rounded-full border border-sand-200 bg-white/70 px-4 text-sm" @change="setQuery({ sort: ($event.target as HTMLSelectElement).value })">
              <option value="newest">Newest</option>
              <option value="price_asc">Price: low to high</option>
              <option value="price_desc">Price: high to low</option>
              <option value="name">Name</option>
            </select>
          </div>
        </div>
        <UiErrorState v-if="error" :error="error" @retry="refreshNuxtData()" />
        <div v-else-if="data?.items.length" class="grid grid-cols-2 gap-4 transition-opacity md:grid-cols-3" :class="status === 'pending' ? 'opacity-50' : ''">
          <div v-for="(p, i) in data.items" :key="p.id" data-aos="fade-up" :data-aos-delay="(i % 3) * 90"><StoreProductCard :product="p" :eager="i < 3" /></div>
        </div>
        <div v-else class="rounded-3xl bg-sand-100"><UiEmpty title="No products match" message="Try removing a filter or searching for something else." /></div>
        <div v-if="data && data.total > data.pageSize" class="mt-8 border-t border-sand-200 px-1 pb-3"><UiPagination v-model:page="page" :total="data.total" :page-size="data.pageSize" /></div>
      </section>
    </div>
  </div>
</template>
