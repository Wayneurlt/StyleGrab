<script setup lang="ts">
import { Check, ChevronDown, Minus, PackageCheck, Plus, RotateCcw, ShoppingBag, Wallet } from 'lucide-vue-next'
import type { ProductCard } from '~/composables/useStore'

interface Variant { id: string, sku: string, title: string, price: number, attributes: Record<string, string>, available: number }
interface Product {
  id: string, name: string, slug: string, description: string, brand: string | null, price: number
  seoTitle: string | null, seoDescription: string | null
  category: { id: string, name: string, slug: string, parent: { name: string, slug: string } | null }
  images: { key: string, alt: string, isPrimary: boolean }[]
  attributes: { code: string, name: string, values: string[] }[]
  variants: Variant[]
  related: ProductCard[]
}

const route = useRoute()
const { data: p, error } = await useFetch<Product>(() => `/api/store/products/${route.params.slug}`)
if (error.value?.statusCode === 404) throw createError({ statusCode: 404, statusMessage: 'Product not found', fatal: true })

const { money } = useFormat()
const cart = useCart()
const toast = useToast()
const siteUrl = useRuntimeConfig().public.siteUrl
const business = useState<{ currency: string } | null>('store-business')

const imageIndex = ref(0)
const selected = reactive<Record<string, string>>({})
const quantity = ref(1)
const added = ref(false)

// Gallery zoom follows the pointer.
const zoom = ref<{ x: number, y: number } | null>(null)
function onZoom(e: MouseEvent) {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  zoom.value = { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 }
}
const openInfo = ref<string | null>('details')
const infoSections = computed(() => [
  { key: 'details', title: 'Details', body: p.value?.description || 'More details coming soon.' },
  { key: 'delivery', title: 'Pickup & delivery', body: 'Choose pickup or delivery at checkout. Our team confirms your order and arranges timing with you; any delivery charge is agreed before dispatch.' },
  { key: 'payment', title: 'Payment', body: 'Nothing is charged on this site. Pay us by M-Pesa, bank transfer or cash using your order number — your order is marked paid once our team confirms it.' },
  { key: 'returns', title: 'Returns', body: 'Every return is recorded against your order, so refunds and exchanges are straightforward.' },
])

// Pre-select attributes that have a single value (e.g. one-size items).
watchEffect(() => {
  for (const a of p.value?.attributes ?? []) if (a.values.length === 1 && !selected[a.code]) selected[a.code] = a.values[0]!
})

const variant = computed<Variant | null>(() => {
  if (!p.value) return null
  if (p.value.variants.length === 1 && !p.value.attributes.length) return p.value.variants[0]!
  if (p.value.attributes.some(a => !selected[a.code])) return null
  return p.value.variants.find(v => p.value!.attributes.every(a => v.attributes[a.code] === selected[a.code])) ?? null
})

/** Is a value selectable given the other current choices (some in-stock variant matches)? */
function optionState(code: string, value: string): 'ok' | 'soldout' | 'none' {
  const matches = p.value!.variants.filter(v => v.attributes[code] === value && p.value!.attributes.every(a => a.code === code || !selected[a.code] || v.attributes[a.code] === selected[a.code]))
  if (!matches.length) return 'none'
  return matches.some(v => v.available > 0) ? 'ok' : 'soldout'
}

const priceLabel = computed(() => {
  if (variant.value) return money(variant.value.price)
  const prices = p.value?.variants.map(v => v.price) ?? []
  const lo = Math.min(...prices)
  const hi = Math.max(...prices)
  return lo === hi ? money(lo) : `${money(lo)} – ${money(hi)}`
})
const missing = computed(() => p.value?.attributes.filter(a => !selected[a.code]).map(a => a.name.toLowerCase()) ?? [])
const maxQty = computed(() => Math.min(20, variant.value?.available ?? 0))
watch(variant, () => (quantity.value = Math.max(1, Math.min(quantity.value, maxQty.value || 1))))

function addToCart() {
  if (!p.value || !variant.value || variant.value.available < 1) return
  const inCart = cart.lines.find(l => l.variantId === variant.value!.id)?.quantity ?? 0
  if (inCart + quantity.value > variant.value.available) {
    toast.error(`Only ${variant.value.available} available${inCart ? ` — you already have ${inCart} in your cart` : ''}`)
    return
  }
  cart.add({ variantId: variant.value.id, quantity: quantity.value, productName: p.value.name, variantTitle: variant.value.title, slug: p.value.slug, imageKey: p.value.images[0]?.key ?? null, unitPrice: variant.value.price })
  added.value = true
  setTimeout(() => (added.value = false), 2000)
  toast.success(`Added ${p.value.name} to your cart`)
}

useSeoMeta({
  title: () => p.value?.seoTitle || p.value?.name || 'Product',
  description: () => p.value?.seoDescription || p.value?.description.slice(0, 160) || '',
  ogTitle: () => p.value?.name,
  ogImage: () => (p.value?.images[0] ? `${siteUrl}/media/${p.value.images[0].key}` : undefined),
  ogType: 'website',
})
useHead(() => ({
  link: [{ rel: 'canonical', href: `${siteUrl}/products/${route.params.slug}` }],
  script: p.value
    ? [{
        type: 'application/ld+json',
        innerHTML: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'Product',
          'name': p.value.name,
          'description': p.value.description,
          'image': p.value.images.map(i => `${siteUrl}/media/${i.key}`),
          'brand': p.value.brand ? { '@type': 'Brand', 'name': p.value.brand } : undefined,
          'offers': p.value.variants.map(v => ({ '@type': 'Offer', 'sku': v.sku, 'price': (v.price / 100).toFixed(2), 'priceCurrency': business.value?.currency ?? 'KES', 'availability': v.available > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock' })),
        }),
      }]
    : [],
}))
</script>

<template>
  <div v-if="p" class="mx-auto max-w-[1200px] px-5 pt-8">
    <nav aria-label="Breadcrumb" class="mb-8 text-[12px] text-ink-muted">
      <NuxtLink to="/shop" class="hover:text-ink">Shop</NuxtLink>
      <template v-if="p.category.parent"><span class="mx-1.5">›</span><NuxtLink :to="`/shop/${p.category.parent.slug}`" class="hover:text-ink">{{ p.category.parent.name }}</NuxtLink></template>
      <span class="mx-1.5">›</span><NuxtLink :to="`/shop/${p.category.slug}`" class="hover:text-ink">{{ p.category.name }}</NuxtLink>
    </nav>

    <div class="grid gap-10 lg:grid-cols-[1.15fr_1fr] lg:gap-16">
      <!-- Gallery -->
      <div class="lg:sticky lg:top-28 lg:self-start" data-aos="fade-right">
        <div class="flex gap-4">
          <div v-if="p.images.length > 1" class="hidden w-20 shrink-0 flex-col gap-3 sm:flex" role="tablist" aria-label="Product images">
            <button
              v-for="(img, i) in p.images"
              :key="img.key"
              type="button"
              role="tab"
              :aria-selected="i === imageIndex"
              :aria-label="`Image ${i + 1}`"
              class="aspect-[4/5] overflow-hidden rounded-xl ring-2 ring-offset-2 transition"
              :class="i === imageIndex ? 'ring-accent' : 'ring-transparent opacity-60 hover:opacity-100'"
              @click="imageIndex = i"
            >
              <img :src="`/media/${img.key}`" :alt="img.alt || p.name" class="size-full object-cover" loading="lazy">
            </button>
          </div>
          <div class="relative flex-1 cursor-zoom-in overflow-hidden rounded-3xl bg-sand-100" @mousemove="onZoom" @mouseleave="zoom = null">
            <UiProductImage
              :key="imageIndex"
              :image-key="p.images[imageIndex]?.key"
              :alt="p.images[imageIndex]?.alt || p.name"
              aspect="aspect-[4/5]"
              rounded="rounded-3xl"
              eager
              class="transition-transform duration-300 ease-out"
              :style="zoom && p.images[imageIndex] ? { transform: 'scale(1.8)', transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined"
            />
            <span v-if="p.images.length > 1" class="num absolute bottom-4 left-4 rounded-full bg-ink/80 px-3 py-1 text-[11px] font-medium text-white backdrop-blur">{{ imageIndex + 1 }} / {{ p.images.length }}</span>
          </div>
        </div>
        <div v-if="p.images.length > 1" class="scrollbar-none mt-3 flex gap-2 overflow-x-auto sm:hidden">
          <button v-for="(img, i) in p.images" :key="img.key" type="button" :aria-label="`Image ${i + 1}`" class="h-20 w-16 shrink-0 overflow-hidden rounded-lg ring-2" :class="i === imageIndex ? 'ring-accent' : 'ring-transparent opacity-60'" @click="imageIndex = i">
            <img :src="`/media/${img.key}`" alt="" class="size-full object-cover" loading="lazy">
          </button>
        </div>
      </div>

      <!-- Details -->
      <div class="flex flex-col" data-aos="fade-left" data-aos-delay="100">
        <p class="text-[15px] font-semibold text-accent-dark">{{ p.brand || p.category.name }}</p>
        <h1 class="mt-1 text-4xl font-semibold leading-tight tracking-[-0.03em] sm:text-5xl">{{ p.name }}</h1>
        <p class="num mt-4 text-[21px] text-ink">{{ priceLabel }}</p>
        <div class="my-8 h-px bg-ink/10" />

        <div class="space-y-7">
          <fieldset v-for="a in p.attributes" :key="a.code">
            <legend class="mb-3 text-[17px] font-semibold">{{ a.name }}<span v-if="selected[a.code]" class="ml-2 font-normal text-ink-muted">{{ selected[a.code] }}</span></legend>
            <div class="flex flex-wrap gap-2.5">
              <button
                v-for="v in a.values"
                :key="v"
                type="button"
                class="min-w-14 rounded-xl border px-5 py-3 text-[15px] transition duration-200 disabled:cursor-not-allowed"
                :class="[
                  selected[a.code] === v ? 'border-ink ring-1 ring-ink' : 'border-sand-300 bg-white hover:border-ink-muted',
                  optionState(a.code, v) !== 'ok' && selected[a.code] !== v ? 'text-ink-faint line-through decoration-1' : '',
                ]"
                :aria-pressed="selected[a.code] === v"
                :disabled="optionState(a.code, v) === 'none'"
                @click="selected[a.code] = selected[a.code] === v ? '' : v"
              >{{ v }}</button>
            </div>
          </fieldset>
        </div>

        <div class="mt-7 text-sm" aria-live="polite">
          <p v-if="variant && variant.available > 0" class="flex items-center gap-2 font-medium text-positive">
            <span class="relative flex size-2"><span class="absolute inline-flex size-full animate-ping rounded-full bg-positive opacity-60" /><span class="relative inline-flex size-2 rounded-full bg-positive" /></span>
            In stock<template v-if="variant.available <= 3"> — only {{ variant.available }} left</template>
          </p>
          <p v-else-if="variant" class="font-medium text-negative">This option is sold out</p>
          <p v-else class="text-ink-muted">Select {{ missing.join(' and ') }} to see availability</p>
        </div>

        <div class="mt-6 flex flex-wrap items-center gap-3">
          <div class="flex h-14 items-center rounded-full border border-sand-300">
            <button type="button" class="flex size-14 items-center justify-center transition hover:text-accent disabled:opacity-30" aria-label="Decrease quantity" :disabled="quantity <= 1" @click="quantity--"><Minus class="size-4" /></button>
            <span class="num w-8 text-center font-medium" aria-live="polite" :aria-label="`Quantity ${quantity}`">{{ quantity }}</span>
            <button type="button" class="flex size-14 items-center justify-center transition hover:text-accent disabled:opacity-30" aria-label="Increase quantity" :disabled="!variant || quantity >= maxQty" @click="quantity++"><Plus class="size-4" /></button>
          </div>
          <button
            type="button"
            class="flex h-14 flex-1 items-center justify-center gap-2 rounded-full bg-ink px-8 text-[17px] font-medium text-white transition hover:bg-ink-soft disabled:opacity-40"
            :disabled="!variant || variant.available < 1"
            @click="addToCart"
          >
            <component :is="added ? Check : ShoppingBag" class="size-[18px]" />
            <span>{{ !variant ? `Select ${missing[0] ?? 'an option'}` : variant.available < 1 ? 'Sold out' : added ? 'Added to cart' : 'Add to cart' }}</span>
          </button>
        </div>
        <NuxtLink v-if="cart.count" to="/cart" class="link-gold mt-4 self-start text-sm font-medium">View cart &amp; check out →</NuxtLink>

        <ul class="mt-8 grid gap-3 rounded-2xl bg-sand-100 p-5 text-[13px] text-ink-soft sm:grid-cols-3">
          <li class="flex items-center gap-2"><PackageCheck class="size-4 shrink-0 text-accent" />Reserved when you order</li>
          <li class="flex items-center gap-2"><Wallet class="size-4 shrink-0 text-accent" />M-Pesa, bank or cash</li>
          <li class="flex items-center gap-2"><RotateCcw class="size-4 shrink-0 text-accent" />Easy returns</li>
        </ul>

        <!-- Info accordion -->
        <div class="mt-8 divide-y divide-sand-200 border-y border-sand-200">
          <div v-for="sec in infoSections" :key="sec.key">
            <button type="button" class="flex w-full items-center justify-between py-5 text-left" :aria-expanded="openInfo === sec.key" @click="openInfo = openInfo === sec.key ? null : sec.key">
              <span class="text-[17px] font-semibold">{{ sec.title }}</span>
              <ChevronDown class="size-4 transition-transform duration-300" :class="openInfo === sec.key ? 'rotate-180 text-accent' : ''" />
            </button>
            <div class="grid transition-[grid-template-rows] duration-300 ease-out" :class="openInfo === sec.key ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'">
              <div class="overflow-hidden">
                <p class="whitespace-pre-line pb-5 text-sm leading-relaxed text-ink-muted">
                  {{ sec.body }}<NuxtLink v-if="sec.key === 'returns'" to="/policies" class="ml-1 font-medium text-ink underline">Read the policy</NuxtLink>
                </p>
              </div>
            </div>
          </div>
        </div>
        <p v-if="variant" class="mt-4 text-[12px] text-ink-faint">SKU {{ variant.sku }}</p>
      </div>
    </div>

    <section v-if="p.related.length" class="mt-28">
      <StoreSectionHeading eyebrow="Complete the look" title="You may also like." />
      <div class="mt-12 grid grid-cols-2 gap-4 md:grid-cols-4">
        <div v-for="(r, i) in p.related" :key="r.id" data-aos="fade-up" :data-aos-delay="i * 100"><StoreProductCard :product="r" /></div>
      </div>
    </section>
  </div>
  <div v-else class="mx-auto max-w-xl py-20"><UiErrorState :error="error" @retry="refreshNuxtData()" /></div>
</template>
