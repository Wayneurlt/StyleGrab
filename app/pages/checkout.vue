<script setup lang="ts">
import { Lock } from 'lucide-vue-next'

useSeoMeta({ title: 'Checkout', robots: 'noindex' })
const cart = useCart()
const { money } = useFormat()
const toast = useToast()


const form = reactive({ name: '', phone: '', email: '', fulfilmentType: 'PICKUP' as 'PICKUP' | 'DELIVERY', address: '', note: '' })
const errors = ref<Record<string, string>>({})

// One idempotency key per checkout attempt — a double click or retry can never create two orders.
const idempotencyKey = useState('checkout-key', () => newKey())
const pending = ref(false)
const summary = ref<{ ok: boolean, subtotal: number, items: { variantId: string, status: string, message: string | null }[] } | null>(null)

onMounted(async () => {
  cart.hydrate()
  if (!cart.lines.length) return navigateTo('/cart')
  summary.value = await apiFetch('/api/store/cart', { method: 'POST', body: { lines: cart.lines.map(l => ({ variantId: l.variantId, quantity: l.quantity })) } })
  if (!summary.value?.ok) {
    toast.error('Some items in your cart changed. Please review your cart.')
    navigateTo('/cart')
  }
})

function validate() {
  const e: Record<string, string> = {}
  if (form.name.trim().length < 2) e.name = 'Enter your name'
  if (form.phone.replace(/\D/g, '').length < 9) e.phone = 'Enter a valid phone number'
  if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Enter a valid email or leave it empty'
  if (form.fulfilmentType === 'DELIVERY' && form.address.trim().length < 5) e.address = 'Enter a delivery address'
  errors.value = e
  return !Object.keys(e).length
}

async function placeOrder() {
  if (!validate() || pending.value) return
  pending.value = true
  try {
    const res = await apiFetch<{ number: string, accessKey: string }>('/api/store/checkout', {
      method: 'POST',
      body: {
        idempotencyKey: idempotencyKey.value,
        lines: cart.lines.map(l => ({ variantId: l.variantId, quantity: l.quantity })),
        contact: { name: form.name, phone: form.phone, email: form.email, address: form.fulfilmentType === 'DELIVERY' ? form.address : null },
        fulfilmentType: form.fulfilmentType,
        customerNote: form.note || null,
      },
    })
    cart.clear()
    idempotencyKey.value = newKey()
    await navigateTo({ path: `/order/${res.number}`, query: { key: res.accessKey } })
  }
  catch (e) {
    toast.error(apiError(e))
    if (apiErrorCode(e) === 'insufficient_stock' || apiErrorCode(e) === 'unavailable') navigateTo('/cart')
  }
  finally {
    pending.value = false
  }
}
</script>

<template>
  <div class="glass-shell p-5 sm:p-8">
    <h1 class="text-3xl font-semibold tracking-tight sm:text-4xl">Checkout</h1>
    <p class="mt-1 text-sm text-ink-soft">No account needed — we'll use your phone number to keep you updated.</p>
    <ClientOnly>
      <form class="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]" novalidate @submit.prevent="placeOrder">
        <div class="glass-card space-y-5 p-5 sm:p-6">
          <h2 class="font-medium">Your details</h2>
          <div class="grid gap-4 sm:grid-cols-2">
            <UiField id="name" label="Full name" :error="errors.name" required><input id="name" v-model="form.name" autocomplete="name" class="field" :aria-invalid="!!errors.name"></UiField>
            <UiField id="phone" label="Phone (WhatsApp preferred)" :error="errors.phone" required><input id="phone" v-model="form.phone" type="tel" autocomplete="tel" class="field" :aria-invalid="!!errors.phone"></UiField>
            <UiField id="email" label="Email (optional)" :error="errors.email" hint="For your order confirmation" class="sm:col-span-2"><input id="email" v-model="form.email" type="email" autocomplete="email" class="field"></UiField>
          </div>
          <fieldset>
            <legend class="label mb-2">How would you like to receive your order?</legend>
            <div class="grid gap-2 sm:grid-cols-2">
              <label v-for="opt in [{ v: 'PICKUP', t: 'Pick up in store', d: 'We will message you when it is ready' }, { v: 'DELIVERY', t: 'Delivery', d: 'Delivery is arranged and priced by our team' }]" :key="opt.v" class="flex cursor-pointer gap-3 rounded-2xl border p-3 transition" :class="form.fulfilmentType === opt.v ? 'border-ink bg-white/80' : 'border-sand-200 bg-sand-50'">
                <input v-model="form.fulfilmentType" type="radio" name="fulfilment" :value="opt.v" class="mt-1 accent-ink">
                <span><span class="block text-sm font-medium">{{ opt.t }}</span><span class="text-xs text-ink-muted">{{ opt.d }}</span></span>
              </label>
            </div>
          </fieldset>
          <UiField v-if="form.fulfilmentType === 'DELIVERY'" id="address" label="Delivery address" :error="errors.address" required><textarea id="address" v-model="form.address" rows="3" autocomplete="street-address" class="field" /></UiField>
          <UiField id="note" label="Note for us (optional)"><textarea id="note" v-model="form.note" rows="2" class="field" /></UiField>
        </div>

        <aside class="glass-card h-fit space-y-4 p-5">
          <h2 class="font-medium">Order summary</h2>
          <ul class="space-y-2 text-sm">
            <li v-for="l in cart.lines" :key="l.variantId" class="flex justify-between gap-3"><span class="min-w-0">{{ l.quantity }} × {{ l.productName }} <span class="text-ink-muted">({{ l.variantTitle }})</span></span><span class="num whitespace-nowrap">{{ money(l.unitPrice * l.quantity) }}</span></li>
          </ul>
          <div class="flex justify-between border-t border-sand-200 pt-3 font-semibold"><span>Total</span><span class="num">{{ money(summary?.subtotal ?? cart.estimatedSubtotal) }}</span></div>
          <p class="rounded-xl bg-sand-50 p-3 text-xs text-ink-soft">Placing your order reserves the items. You'll pay us directly (M-Pesa, bank transfer or cash) — payment instructions are shown on the next page. Your order is not marked paid until our team confirms the payment.</p>
          <UiButton type="submit" block size="lg" :loading="pending" :icon="Lock">Place order</UiButton>
        </aside>
      </form>
    </ClientOnly>
  </div>
</template>
