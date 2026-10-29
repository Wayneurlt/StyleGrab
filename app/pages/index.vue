<script setup lang="ts">
import { ArrowRight, ChevronLeft, ChevronRight, MessageCircle, PackageCheck, Pause, Play, RotateCcw, ShoppingBag, Store, Wallet } from 'lucide-vue-next'
import type { ProductCard } from '~/composables/useStore'

const { data, error } = await useFetch<{
  business: { name: string, phone: string }
  featured: ProductCard[]
  newArrivals: ProductCard[]
  bestSellers: ProductCard[]
  categories: { id: string, name: string, slug: string, description: string | null, imageKey: string | null, productCount: number }[]
}>('/api/store/home')
const business = useState<{ phone: string, address: string } | null>('store-business')
const { money } = useFormat()

useSeoMeta({ description: 'Shop silk scarves, cashmere scarves, belts, sling bags and ankle stockings from StyleGrab.', ogTitle: 'StyleGrab', ogType: 'website' })

/** Distinct products that have a photo, featured first. */
const withPhotos = computed(() => {
  const seen = new Set<string>()
  return [...(data.value?.featured ?? []), ...(data.value?.newArrivals ?? [])].filter((p) => {
    if (!p.images[0] || seen.has(p.id)) return false
    seen.add(p.id)
    return true
  })
})
const slides = computed(() => withPhotos.value.slice(0, 4))
// 5 tiles = one large (2×2) + four small: two complete rows.
const bento = computed(() => withPhotos.value.slice(0, 5))
const shopCategories = computed(() => (data.value?.categories ?? []).filter(c => c.productCount > 0))
const showcase = computed(() => withPhotos.value.find(p => /silk/i.test(p.name)) ?? withPhotos.value[0])
const price = (p: ProductCard) => (p.priceFrom === p.priceTo ? money(p.priceFrom) : `From ${money(p.priceFrom)}`)

// ── Hero slideshow ──
const active = ref(0)
const playing = ref(true)
const hovering = ref(false)
let timer: ReturnType<typeof setInterval> | undefined
function go(i: number) {
  const n = slides.value.length
  if (n) active.value = (i + n) % n
}
onMounted(() => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) playing.value = false
  timer = setInterval(() => {
    if (playing.value && !hovering.value) go(active.value + 1)
  }, 6500)
})
onBeforeUnmount(() => clearInterval(timer))

const reasons = [
  { icon: PackageCheck, t: 'Reserved the moment you order.', d: 'Your pieces are set aside while we confirm and arrange pickup or delivery.' },
  { icon: Wallet, t: 'Pay the way you already do.', d: 'M-Pesa, bank transfer or cash. Nothing is charged on this site — we confirm every payment.' },
  { icon: RotateCcw, t: 'Returns, handled properly.', d: 'Every return is recorded against your order, so refunds and exchanges are simple.' },
]
const channels = computed(() => [
  { icon: ShoppingBag, t: 'Online', d: 'Place your order here and we reserve it straight away.', cta: 'Shop now', to: '/shop' },
  { icon: MessageCircle, t: 'WhatsApp & Instagram', d: business.value?.phone ? `Message us on ${business.value.phone}.` : 'Message us and we will take your order.', cta: business.value?.phone ? 'Call us' : null, to: business.value?.phone ? `tel:${business.value.phone}` : null },
  { icon: Store, t: 'In store', d: business.value?.address || 'Visit us and pay with M-Pesa, cash or card.', cta: null, to: null },
])
</script>

<template>
  <div>
    <!-- ───────── Hero slideshow ───────── -->
    <section v-if="slides.length" class="px-3 pt-3 sm:px-5" aria-roledescription="carousel" aria-label="Featured products" @mouseenter="hovering = true" @mouseleave="hovering = false">
      <div class="relative h-[78vh] min-h-[520px] overflow-hidden rounded-[2rem] bg-coal">
        <TransitionGroup enter-from-class="opacity-0" leave-to-class="opacity-0" enter-active-class="transition-opacity duration-1000" leave-active-class="transition-opacity duration-1000">
          <div v-for="(s, i) in slides" v-show="i === active" :key="s.id" class="absolute inset-0" role="group" aria-roledescription="slide" :aria-label="`${i + 1} of ${slides.length}: ${s.name}`">
            <!-- Phones: the photo fills the panel (portrait photos suit portrait screens). -->
            <img :src="`/media/${s.images[0]!.key}`" :alt="s.images[0]!.alt || s.name" class="size-full object-cover lg:hidden" :class="i === active ? 'animate-ken-burns' : ''" :loading="i === 0 ? 'eager' : 'lazy'">
            <!-- Desktop: a blurred wash of the same photo fills the wide panel… -->
            <img :src="`/media/${s.images[0]!.key}`" alt="" aria-hidden="true" class="absolute inset-0 hidden size-full scale-125 object-cover opacity-70 blur-3xl saturate-150 lg:block" :loading="i === 0 ? 'eager' : 'lazy'">
            <div class="absolute inset-0 bg-gradient-to-r from-coal/90 via-coal/55 to-coal/20" />
            <div class="absolute inset-0 bg-gradient-to-t from-coal/60 via-transparent to-transparent lg:hidden" />
            <!-- …and the whole photo sits uncropped in a frame on the right. -->
            <div class="absolute inset-y-10 right-10 hidden aspect-[4/5] overflow-hidden rounded-[1.75rem] shadow-[0_40px_80px_-30px_rgba(0,0,0,0.8)] ring-1 ring-chalk/15 lg:block xl:right-16">
              <img :src="`/media/${s.images[0]!.key}`" :alt="s.images[0]!.alt || s.name" class="size-full object-cover" :class="i === active ? 'animate-ken-burns' : ''" :loading="i === 0 ? 'eager' : 'lazy'">
            </div>
          </div>
        </TransitionGroup>

        <div class="relative flex h-full flex-col justify-end px-7 pb-20 sm:px-12 sm:pb-24 lg:justify-center lg:pb-10 lg:pl-16 xl:pl-24">
          <Transition mode="out-in" enter-from-class="translate-y-4 opacity-0" leave-to-class="-translate-y-2 opacity-0" enter-active-class="transition duration-700 ease-out" leave-active-class="transition duration-300">
            <div v-if="slides[active]" :key="slides[active]!.id" class="max-w-xl text-chalk lg:max-w-[42%]">
              <p class="text-[13px] font-semibold uppercase tracking-[0.25em] text-accent-light">{{ slides[active]!.category.name }}</p>
              <h1 class="mt-3 text-4xl font-semibold leading-[1.05] tracking-[-0.035em] sm:text-6xl lg:text-7xl">{{ slides[active]!.name }}</h1>
              <p class="num mt-4 text-[19px] text-chalk/80">{{ price(slides[active]!) }}</p>
              <div class="mt-8 flex flex-wrap items-center gap-3">
                <NuxtLink :to="`/products/${slides[active]!.slug}`" class="btn-gold h-12 text-[15px]">Shop now <ArrowRight class="size-4" /></NuxtLink>
                <NuxtLink :to="`/shop/${slides[active]!.category.slug}`" class="btn-outline-light h-12 text-[15px]">More {{ slides[active]!.category.name.toLowerCase() }}</NuxtLink>
              </div>
            </div>
          </Transition>
        </div>

        <!-- Controls -->
        <div class="absolute inset-x-0 bottom-6 flex items-center justify-center gap-3">
          <button type="button" class="flex size-9 items-center justify-center rounded-full bg-chalk/15 text-chalk backdrop-blur-md transition hover:bg-chalk/30" aria-label="Previous slide" @click="go(active - 1)"><ChevronLeft class="size-4" /></button>
          <div class="flex items-center gap-2 rounded-full bg-chalk/15 px-3 py-2.5 backdrop-blur-md">
            <button v-for="(s, i) in slides" :key="s.id" type="button" class="h-1.5 overflow-hidden rounded-full bg-chalk/40 transition-all duration-500" :class="i === active ? 'w-8' : 'w-1.5'" :aria-label="`Go to slide ${i + 1}`" :aria-current="i === active" @click="go(i)">
              <span v-if="i === active" :key="`${active}-${playing}`" class="block h-full bg-chalk" :class="playing ? 'origin-left animate-progress' : ''" />
            </button>
          </div>
          <button type="button" class="flex size-9 items-center justify-center rounded-full bg-chalk/15 text-chalk backdrop-blur-md transition hover:bg-chalk/30" :aria-label="playing ? 'Pause slideshow' : 'Play slideshow'" @click="playing = !playing"><component :is="playing ? Pause : Play" class="size-4" /></button>
          <button type="button" class="flex size-9 items-center justify-center rounded-full bg-chalk/15 text-chalk backdrop-blur-md transition hover:bg-chalk/30" aria-label="Next slide" @click="go(active + 1)"><ChevronRight class="size-4" /></button>
        </div>
      </div>
    </section>

    <UiErrorState v-if="error" :error="error" class="mx-auto mt-10 max-w-xl" @retry="refreshNuxtData()" />

    <!-- ───────── Category shortcuts ───────── -->
    <section v-if="shopCategories.length" class="mx-auto mt-16 max-w-[1200px] px-5">
      <div class="scrollbar-none flex justify-start gap-6 overflow-x-auto pb-2 sm:justify-center sm:gap-10">
        <NuxtLink v-for="(c, i) in shopCategories" :key="c.id" :to="`/shop/${c.slug}`" class="group flex shrink-0 flex-col items-center gap-3" data-aos="fade-up" :data-aos-delay="i * 70">
          <span class="relative size-24 overflow-hidden rounded-full bg-sand-100 ring-1 ring-ink/10 transition duration-500 group-hover:ring-2 group-hover:ring-accent sm:size-28">
            <UiProductImage :image-key="c.imageKey" :alt="c.name" aspect="aspect-square" rounded="rounded-full" class="transition duration-700 group-hover:scale-110" />
          </span>
          <span class="text-[14px] font-medium text-ink">{{ c.name }}</span>
          <span class="-mt-2.5 text-[12px] text-ink-muted">{{ c.productCount }} {{ c.productCount === 1 ? 'item' : 'items' }}</span>
        </NuxtLink>
      </div>
    </section>

    <!-- ───────── Bento grid ───────── -->
    <section v-if="bento.length" class="mx-auto mt-24 max-w-[1200px] px-5">
      <h2 class="text-[2rem] font-semibold leading-tight tracking-[-0.025em] sm:text-[2.75rem]" data-aos="fade-up">
        The edit. <span class="text-ink-muted">Pieces that finish the look.</span>
      </h2>
      <div class="mt-10 grid auto-rows-[220px] grid-cols-2 gap-4 md:auto-rows-[260px] md:grid-cols-4">
        <NuxtLink
          v-for="(p, i) in bento"
          :key="p.id"
          :to="`/products/${p.slug}`"
          class="group relative overflow-hidden rounded-[1.75rem] bg-sand-100"
          :class="i === 0 ? 'col-span-2 row-span-2' : ''"
          data-aos="fade-up"
          :data-aos-delay="i * 90"
        >
          <img :src="`/media/${p.images[0]!.key}`" :alt="p.images[0]!.alt || p.name" class="absolute inset-0 size-full object-cover transition duration-[1200ms] ease-out group-hover:scale-105" loading="lazy">
          <div class="absolute inset-0 bg-gradient-to-t from-coal/75 via-coal/5 to-transparent opacity-90 transition group-hover:opacity-100" />
          <div class="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-5 text-chalk sm:p-6">
            <div class="min-w-0">
              <p class="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent-light">{{ p.category.name }}</p>
              <p class="mt-1 truncate font-semibold tracking-[-0.01em]" :class="i === 0 ? 'text-2xl sm:text-3xl' : 'text-lg'">{{ p.name }}</p>
              <p class="num mt-0.5 text-sm text-chalk/75">{{ price(p) }}</p>
            </div>
            <span class="flex size-10 shrink-0 translate-y-2 items-center justify-center rounded-full bg-chalk text-coal opacity-0 transition duration-300 group-hover:translate-y-0 group-hover:opacity-100" aria-hidden="true"><ArrowRight class="size-4" /></span>
          </div>
        </NuxtLink>
      </div>
    </section>

    <!-- ───────── Dark showcase band ───────── -->
    <section v-if="showcase" class="mt-28 px-3 sm:px-5">
      <div class="relative mx-auto grid max-w-[1400px] items-center gap-10 overflow-hidden rounded-[2rem] bg-coal px-7 py-16 text-chalk sm:px-14 lg:grid-cols-2 lg:py-20">
        <div class="pointer-events-none absolute -right-24 -top-24 size-[28rem] rounded-full bg-accent/25 blur-3xl" aria-hidden="true" />
        <div class="relative" data-aos="fade-right">
          <p class="text-[13px] font-semibold uppercase tracking-[0.25em] text-accent-light">Signature</p>
          <h2 class="mt-3 text-4xl font-semibold leading-[1.05] tracking-[-0.035em] sm:text-6xl">The <span class="text-gold">silk</span> edit.</h2>
          <p class="mt-5 max-w-md text-[17px] leading-relaxed text-chalk/65">Small squares to knot at the neck, long scarves to drape and wrap — silk that catches the light and finishes any outfit.</p>
          <div class="mt-8 flex flex-wrap gap-3">
            <NuxtLink :to="`/products/${showcase.slug}`" class="btn-gold h-12 text-[15px]">Shop {{ showcase.name }}</NuxtLink>
            <NuxtLink :to="`/shop/${showcase.category.slug}`" class="btn-outline-light h-12 text-[15px]">See all</NuxtLink>
          </div>
        </div>
        <NuxtLink :to="`/products/${showcase.slug}`" class="group relative block" data-aos="zoom-in" data-aos-delay="150">
          <div class="absolute -inset-3 rounded-[2rem] border border-accent/30" aria-hidden="true" />
          <img :src="`/media/${showcase.images[0]!.key}`" :alt="showcase.name" class="relative aspect-square w-full rounded-[1.6rem] object-cover transition duration-1000 group-hover:scale-[1.02]" loading="lazy">
        </NuxtLink>
      </div>
    </section>

    <!-- ───────── Why StyleGrab ───────── -->
    <section class="mx-auto mt-24 max-w-[1200px] px-5">
      <h2 class="text-[2rem] font-semibold leading-tight tracking-[-0.025em] sm:text-[2.75rem]" data-aos="fade-up">
        Why StyleGrab. <span class="text-ink-muted">Small range. Honest stock.</span>
      </h2>
      <div class="mt-10 grid gap-4 md:grid-cols-3">
        <div v-for="(r, i) in reasons" :key="r.t" class="group rounded-[1.75rem] bg-sand-100 p-8 transition duration-500 hover:-translate-y-1 hover:shadow-gold" data-aos="fade-up" :data-aos-delay="i * 100">
          <span class="flex size-12 items-center justify-center rounded-2xl bg-coal text-accent-light transition group-hover:scale-110"><component :is="r.icon" class="size-6" stroke-width="1.6" /></span>
          <p class="mt-8 text-[21px] font-semibold leading-snug tracking-[-0.015em]">{{ r.t }}</p>
          <p class="mt-2 text-[15px] leading-relaxed text-ink-muted">{{ r.d }}</p>
        </div>
      </div>
    </section>

    <!-- ───────── All pieces ───────── -->
    <section v-if="data?.newArrivals.length" class="mx-auto mt-28 max-w-[1200px] px-5">
      <StoreSectionHeading eyebrow="Just in" title="New arrivals." />
      <div class="mt-12 grid grid-cols-2 gap-4 md:grid-cols-3">
        <div v-for="(p, i) in data.newArrivals" :key="p.id" data-aos="fade-up" :data-aos-delay="(i % 3) * 90"><StoreProductCard :product="p" /></div>
      </div>
      <p class="mt-10 text-center" data-aos="fade-up"><NuxtLink to="/shop" class="inline-flex h-12 items-center gap-2 rounded-full border border-ink/15 px-7 text-[15px] font-medium transition hover:border-ink hover:bg-ink hover:text-white">See everything <ArrowRight class="size-4" /></NuxtLink></p>
    </section>

    <!-- ───────── Best sellers (only when real sales exist) ───────── -->
    <section v-if="data?.bestSellers.length" class="mx-auto mt-28 max-w-[1200px] px-5">
      <StoreSectionHeading eyebrow="Most loved" title="Best sellers." />
      <div class="mt-12 grid grid-cols-2 gap-4 md:grid-cols-4">
        <div v-for="(p, i) in data.bestSellers.slice(0, 4)" :key="p.id" data-aos="fade-up" :data-aos-delay="i * 80"><StoreProductCard :product="p" /></div>
      </div>
    </section>

    <!-- ───────── Order your way ───────── -->
    <section class="mx-auto mt-28 max-w-[1200px] px-5">
      <StoreSectionHeading title="Order your way." subtitle="Every channel draws from the same stock, so what we confirm is what we have." />
      <div class="mt-12 grid gap-10 text-center md:grid-cols-3">
        <div v-for="(c, i) in channels" :key="c.t" data-aos="fade-up" :data-aos-delay="i * 100">
          <span class="mx-auto flex size-14 items-center justify-center rounded-full border border-accent/40 text-accent-dark"><component :is="c.icon" class="size-6" stroke-width="1.5" /></span>
          <p class="mt-5 text-[19px] font-semibold tracking-[-0.01em]">{{ c.t }}</p>
          <p class="mx-auto mt-2 max-w-xs text-[15px] leading-relaxed text-ink-muted">{{ c.d }}</p>
          <NuxtLink v-if="c.to && c.cta" :to="c.to" class="mt-3 inline-block text-[15px] text-accent-dark hover:underline">{{ c.cta }} ›</NuxtLink>
        </div>
      </div>
    </section>

    <section v-if="data && !withPhotos.length && !data.newArrivals.length" class="mx-auto mt-16 max-w-xl">
      <UiEmpty title="The shop is being stocked" message="Products will appear here as soon as they are published." />
    </section>
  </div>
</template>

