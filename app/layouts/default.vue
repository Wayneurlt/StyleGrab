<script setup lang="ts">
import { Menu, Search, ShoppingBag, X } from 'lucide-vue-next'

const business = await useStoreInfo()
const { data: categories } = await useFetch('/api/store/categories', { key: 'store-categories', dedupe: 'defer' })
const topCategories = computed(() => (categories.value ?? []).filter(c => !c.parentId))
const cart = useCart()
const route = useRoute()

// Pages that manage their own width (full-bleed sections); everything else gets the standard container.
const fullBleed = computed(() => route.path === '/' || route.path.startsWith('/shop') || route.path.startsWith('/products/'))

const menuOpen = ref(false)
const searchOpen = ref(false)
const q = ref(typeof route.query.q === 'string' ? route.query.q : '')
const searchInput = ref<HTMLInputElement | null>(null)
watch(() => route.fullPath, () => {
  menuOpen.value = false
  searchOpen.value = false
})
watch(searchOpen, async (v) => {
  if (v) {
    await nextTick()
    searchInput.value?.focus()
  }
})
function search() {
  navigateTo({ path: '/shop', query: q.value.trim() ? { q: q.value.trim() } : {} })
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    searchOpen.value = false
    menuOpen.value = false
  }
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

const name = computed(() => business.value?.name ?? 'StyleGrab')
useHead({
  titleTemplate: t => (t ? `${t} · ${name.value}` : `${name.value} — Scarves, belts, bags & shoes`),
  meta: [{ name: 'description', content: 'Fashion accessories — scarves, belts, bags and shoes.' }],
})
</script>

<template>
  <div class="flex min-h-screen flex-col bg-white">
    <a href="#main" class="sr-only z-[70] rounded-full bg-white px-4 py-2 focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Skip to content</a>

    <!-- Header: categories · centred logo · actions -->
    <header class="sticky top-0 z-30 border-b border-ink/[0.08] bg-white/80 backdrop-blur-xl backdrop-saturate-150">
      <div class="mx-auto grid h-[72px] max-w-[1200px] grid-cols-[1fr_auto_1fr] items-center px-5">
        <div class="flex items-center">
          <button type="button" class="-ml-2 flex size-10 items-center justify-center rounded-full text-ink lg:hidden" aria-label="Open menu" @click="menuOpen = true"><Menu class="size-5" /></button>
          <nav class="hidden items-center gap-7 lg:flex" aria-label="Categories">
            <NuxtLink v-for="c in topCategories.slice(0, 4)" :key="c.id" :to="`/shop/${c.slug}`" class="text-[13px] text-ink/80 transition hover:text-ink" active-class="!text-ink font-medium">{{ c.name }}</NuxtLink>
            <NuxtLink to="/shop" class="text-[13px] text-ink/80 transition hover:text-ink" exact-active-class="!text-ink font-medium">Shop all</NuxtLink>
          </nav>
        </div>

        <NuxtLink to="/" class="flex justify-center px-4" :aria-label="`${name} — home`">
          <UiLogo alt="" class="h-12 transition-transform duration-300 hover:scale-[1.03]" />
        </NuxtLink>

        <div class="flex items-center justify-end gap-1">
          <UiThemeToggle />
          <button type="button" class="flex size-10 items-center justify-center rounded-full text-ink/80 transition hover:text-ink" aria-label="Search" @click="searchOpen = true"><Search class="size-[18px]" /></button>
          <NuxtLink to="/cart" class="relative flex size-10 items-center justify-center rounded-full text-ink/80 transition hover:text-ink" :aria-label="`Cart, ${cart.count} items`">
            <ShoppingBag class="size-[18px]" />
            <ClientOnly><span v-if="cart.count" class="num absolute right-0.5 top-0.5 flex size-[18px] items-center justify-center rounded-full bg-ink text-[10px] font-semibold text-white">{{ cart.count }}</span></ClientOnly>
          </NuxtLink>
        </div>
      </div>
    </header>

    <!-- Quiet announcement line -->
    <p class="bg-sand-100 px-4 py-2.5 text-center text-[12px] text-ink-muted">
      Order online, on WhatsApp or in store — one stock, always accurate.
      <NuxtLink to="/shop" class="ml-1 text-accent-dark hover:underline">Shop now ›</NuxtLink>
    </p>

    <main id="main" class="flex-1">
      <slot v-if="fullBleed" />
      <div v-else class="mx-auto max-w-[1200px] px-5 py-12"><slot /></div>
    </main>

    <!-- Footer -->
    <footer class="mt-24 bg-sand-100 text-[12px] text-ink-muted">
      <div class="mx-auto max-w-[1200px] px-5 py-12">
        <div class="grid gap-10 border-b border-ink/10 pb-10 sm:grid-cols-3">
          <div>
            <UiLogo :alt="name" class="h-10" />
            <p class="mt-4 max-w-xs leading-relaxed">Scarves, belts, bags and shoes, chosen to finish the look.</p>
          </div>
          <div>
            <p class="mb-3 font-semibold text-ink">Shop</p>
            <ul class="space-y-2">
              <li v-for="c in topCategories" :key="c.id"><NuxtLink :to="`/shop/${c.slug}`" class="hover:text-ink hover:underline">{{ c.name }}</NuxtLink></li>
              <li><NuxtLink to="/shop" class="hover:text-ink hover:underline">All products</NuxtLink></li>
            </ul>
          </div>
          <div>
            <p class="mb-3 font-semibold text-ink">Help</p>
            <ul class="space-y-2">
              <li v-if="business?.phone"><a :href="`tel:${business.phone}`" class="hover:text-ink hover:underline">{{ business.phone }}</a></li>
              <li v-if="business?.email"><a :href="`mailto:${business.email}`" class="hover:text-ink hover:underline">{{ business.email }}</a></li>
              <li v-if="business?.address">{{ business.address }}</li>
              <li><NuxtLink to="/policies" class="hover:text-ink hover:underline">Returns &amp; policies</NuxtLink></li>
            </ul>
          </div>
        </div>
        <p class="pt-6">Copyright © {{ new Date().getFullYear() }} {{ name }}. All prices in {{ business?.currency ?? 'KES' }}.</p>
      </div>
    </footer>

    <!-- Search overlay -->
    <Teleport to="body">
      <Transition enter-from-class="opacity-0" leave-to-class="opacity-0" enter-active-class="transition duration-200" leave-active-class="transition duration-150">
        <div v-if="searchOpen" class="fixed inset-0 z-[60] bg-white/90 backdrop-blur-2xl" role="dialog" aria-modal="true" aria-label="Search" @click.self="searchOpen = false">
          <div class="mx-auto max-w-[680px] px-6 pt-24">
            <form role="search" class="flex items-center gap-3 border-b border-ink/10 pb-4" @submit.prevent="search">
              <Search class="size-6 text-ink-muted" aria-hidden="true" />
              <span class="sr-only">Search products</span>
              <input ref="searchInput" v-model="q" type="search" placeholder="Search StyleGrab" class="w-full bg-transparent text-2xl font-semibold tracking-tight text-ink outline-none placeholder:text-ink-faint">
              <button type="button" class="rounded-full p-2 text-ink-muted hover:text-ink" aria-label="Close search" @click="searchOpen = false"><X class="size-5" /></button>
            </form>
            <p class="mt-8 text-[12px] font-medium text-ink-muted">Quick links</p>
            <ul class="mt-3 space-y-2.5">
              <li v-for="c in topCategories" :key="c.id"><NuxtLink :to="`/shop/${c.slug}`" class="text-[15px] font-medium text-ink hover:text-accent-dark">→ {{ c.name }}</NuxtLink></li>
            </ul>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Mobile menu -->
    <Teleport to="body">
      <Transition enter-from-class="opacity-0" leave-to-class="opacity-0" enter-active-class="transition duration-200" leave-active-class="transition duration-150">
        <div v-if="menuOpen" class="fixed inset-0 z-50 bg-white/95 backdrop-blur-2xl lg:hidden">
          <div class="flex h-16 items-center justify-between px-5">
            <UiLogo :alt="name" class="h-9" />
            <button type="button" class="rounded-full p-2 text-ink" aria-label="Close menu" @click="menuOpen = false"><X class="size-5" /></button>
          </div>
          <nav class="px-8 pt-6" aria-label="Menu">
            <NuxtLink v-for="(c, i) in topCategories" :key="c.id" :to="`/shop/${c.slug}`" class="block animate-fade-up py-2.5 text-3xl font-semibold tracking-tight text-ink" :style="{ animationDelay: `${i * 50}ms` }">{{ c.name }}</NuxtLink>
            <NuxtLink to="/shop" class="block py-2.5 text-3xl font-semibold tracking-tight text-ink">Shop all</NuxtLink>
          </nav>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
