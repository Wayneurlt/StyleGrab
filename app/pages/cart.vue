<script setup lang="ts">
import { AlertCircle, Minus, Plus, Trash2 } from 'lucide-vue-next'

useSeoMeta({ title: 'Your cart', robots: 'noindex' })
const cart = useCart()
const { money } = useFormat()

interface Validated {
  ok: boolean
  subtotal: number
  items: ({ variantId: string, quantity: number, status: 'unavailable', message: string } | { variantId: string, productName: string, slug: string, variantTitle: string, sku: string, imageKey: string | null, unitPrice: number, quantity: number, available: number, lineTotal: number, status: 'ok' | 'out_of_stock' | 'insufficient', message: string | null })[]
}
const result = ref<Validated | null>(null)
const loading = ref(false)
const error = ref<unknown>(null)

/** Revalidate prices and stock with the server whenever the cart changes. */
async function validate() {
  if (!cart.lines.length) {
    result.value = null
    return
  }
  loading.value = true
  error.value = null
  try {
    result.value = await apiFetch<Validated>('/api/store/cart', { method: 'POST', body: { lines: cart.lines.map(l => ({ variantId: l.variantId, quantity: l.quantity })) } })
    // Refresh display prices from the server's current values.
    for (const i of result.value.items) {
      if ('unitPrice' in i) {
        const line = cart.lines.find(l => l.variantId === i.variantId)
        if (line && line.unitPrice !== i.unitPrice) line.unitPrice = i.unitPrice
      }
    }
    cart.persist()
  }
  catch (e) {
    error.value = e
  }
  finally {
    loading.value = false
  }
}
onMounted(() => {
  cart.hydrate()
  validate()
})
let t: ReturnType<typeof setTimeout> | undefined
watch(() => cart.lines.map(l => `${l.variantId}:${l.quantity}`).join(), () => {
  clearTimeout(t)
  t = setTimeout(validate, 250)
})
const info = (variantId: string) => result.value?.items.find(i => i.variantId === variantId)
function fixAll() {
  for (const i of result.value?.items ?? []) {
    if (i.status === 'unavailable' || i.status === 'out_of_stock') cart.remove(i.variantId)
    else if (i.status === 'insufficient') cart.setQuantity(i.variantId, i.available)
  }
}
</script>

<template>
  <div class="glass-shell p-5 sm:p-8">
    <h1 class="text-3xl font-semibold tracking-tight sm:text-4xl">Your cart</h1>
    <ClientOnly>
      <div v-if="!cart.lines.length" class="mt-6"><UiEmpty title="Your cart is empty" message="Find something you love in the shop."><UiButton to="/shop">Start shopping</UiButton></UiEmpty></div>
      <div v-else class="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
        <ul class="space-y-3">
          <li v-for="l in cart.lines" :key="l.variantId" class="glass-card flex gap-4 p-3">
            <NuxtLink :to="`/products/${l.slug}`" class="w-24 shrink-0"><UiProductImage :image-key="l.imageKey" :alt="l.productName" aspect="aspect-[4/5]" rounded="rounded-xl" /></NuxtLink>
            <div class="flex min-w-0 flex-1 flex-col">
              <div class="flex justify-between gap-3">
                <div class="min-w-0">
                  <NuxtLink :to="`/products/${l.slug}`" class="font-medium hover:underline">{{ l.productName }}</NuxtLink>
                  <p class="text-sm text-ink-muted">{{ l.variantTitle }}</p>
                </div>
                <p class="num font-semibold">{{ money(l.unitPrice * l.quantity) }}</p>
              </div>
              <p v-if="info(l.variantId)?.message" class="mt-1 flex items-center gap-1 text-xs font-medium text-negative"><AlertCircle class="size-3.5" />{{ info(l.variantId)?.message }}</p>
              <div class="mt-auto flex items-center justify-between pt-3">
                <div class="flex h-9 items-center rounded-full border border-sand-200 bg-white/70">
                  <button type="button" class="flex size-9 items-center justify-center" :aria-label="`Decrease ${l.productName}`" @click="cart.setQuantity(l.variantId, l.quantity - 1)"><Minus class="size-3.5" /></button>
                  <span class="num w-6 text-center text-sm">{{ l.quantity }}</span>
                  <button type="button" class="flex size-9 items-center justify-center" :aria-label="`Increase ${l.productName}`" @click="cart.setQuantity(l.variantId, l.quantity + 1)"><Plus class="size-3.5" /></button>
                </div>
                <button type="button" class="flex items-center gap-1 text-sm text-ink-muted hover:text-negative" @click="cart.remove(l.variantId)"><Trash2 class="size-4" />Remove</button>
              </div>
            </div>
          </li>
        </ul>
        <aside class="glass-card h-fit space-y-4 p-5">
          <h2 class="font-medium">Summary</h2>
          <div class="flex justify-between text-sm"><span>Subtotal</span><span class="num font-semibold">{{ money(result?.subtotal ?? cart.estimatedSubtotal) }}</span></div>
          <p class="text-xs text-ink-muted">Delivery or pickup arrangements are confirmed by our team after you order. Payment is made directly to us — nothing is charged online.</p>
          <div v-if="result && !result.ok" class="rounded-xl bg-negative-tint p-3 text-sm text-negative" role="alert">
            Some items changed since you added them.
            <button type="button" class="mt-1 block font-semibold underline" @click="fixAll">Update my cart</button>
          </div>
          <UiErrorState v-if="error" :error="error" @retry="validate" />
          <UiButton block size="lg" to="/checkout" :disabled="loading || !result?.ok">Checkout</UiButton>
          <UiButton block variant="ghost" to="/shop">Continue shopping</UiButton>
        </aside>
      </div>
      <template #fallback><UiSkeleton :rows="3" height="h-28" class="mt-6" /></template>
    </ClientOnly>
  </div>
</template>
