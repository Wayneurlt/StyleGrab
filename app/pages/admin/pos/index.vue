<script setup lang="ts">
import { Banknote, Check, CircleSlash, CreditCard, Landmark, Minus, Plus, Printer, Smartphone, Tag, Trash2, UserRound, Wallet, X } from 'lucide-vue-next'
import type { Component } from 'vue'
import type { createOrder } from '~~/server/services/orders'
import type { PickedVariant } from '~/components/admin/VariantPicker.vue'
import type { PickedCustomer } from '~/components/sales/CustomerPicker.vue'

/**
 * Point of sale — built for speed. Customers pay outside StyleGrab (cash, M-Pesa, card machine, bank):
 * the cashier adds items, taps how the customer paid, and completes the sale. Stock is deducted once,
 * on the server, with the same rules as every other channel.
 */
type Sale = Awaited<ReturnType<typeof createOrder>>
interface Line { variantId: string, name: string, title: string, sku: string, imageKey: string | null, price: number, available: number, quantity: number }
interface Method { id: string, name: string, type: string, isActive: boolean }

definePageMeta({ layout: 'admin' })
useHead({ title: 'Point of sale' })

const { can } = useStaff()
const { money } = useFormat()
const toast = useToast()

// ── Catalogue ──
const { data: categories } = useFetch('/api/admin/categories', { server: false })
const roots = computed(() => (categories.value ?? []).filter(c => !c.parentId))
const categoryId = ref<string | null>(null)
const { data: grid, status: gridStatus } = useFetch<PickedVariant[]>('/api/admin/variants/search', {
  query: computed(() => ({ categoryId: categoryId.value || undefined })),
  server: false,
})

// ── Cart ──
const lines = ref<Line[]>([])
const picker = ref<{ focus: () => void } | null>(null)
function add(v: PickedVariant) {
  const existing = lines.value.find(l => l.variantId === v.variantId)
  const inCart = existing?.quantity ?? 0
  if (inCart + 1 > v.available) {
    toast.error(v.available <= 0 ? `${v.productName} is out of stock` : `Only ${v.available} of ${v.productName} in stock`)
    return
  }
  if (existing) existing.quantity++
  else lines.value.unshift({ variantId: v.variantId, name: v.productName, title: v.title, sku: v.sku, imageKey: v.imageKey, price: v.price, available: v.available, quantity: 1 })
}
function setQty(l: Line, q: number) {
  if (q <= 0) lines.value = lines.value.filter(x => x !== l)
  else if (q > l.available) toast.error(`Only ${l.available} in stock`)
  else l.quantity = q
}
const subtotal = computed(() => lines.value.reduce((s, l) => s + l.price * l.quantity, 0))
const inCart = (variantId: string) => lines.value.find(l => l.variantId === variantId)?.quantity ?? 0

// ── Optional extras (discount, customer) ──
const showDiscount = ref(false)
const discountType = ref<'PERCENT' | 'FIXED'>('PERCENT')
const discountPercent = ref<number | null>(null)
const discountFixed = ref<number | null>(null)
const discount = computed(() => {
  if (!showDiscount.value) return 0
  if (discountType.value === 'PERCENT') return Math.round(subtotal.value * Math.min(100, Math.max(0, discountPercent.value ?? 0)) / 100)
  return Math.min(subtotal.value, discountFixed.value ?? 0)
})
const total = computed(() => subtotal.value - discount.value)
const showCustomer = ref(false)
const customer = ref<PickedCustomer | null>(null)

// ── How they paid ──
const { data: methodsData } = useFetch<Method[]>('/api/admin/payment-methods', { server: false })
const methods = computed(() => (methodsData.value ?? []).filter(m => m.isActive && m.type !== 'EXCHANGE_CREDIT'))
const icon = (type: string): Component => ({ CASH: Banknote, MOBILE_MONEY: Smartphone, CARD_TERMINAL: CreditCard, BANK_TRANSFER: Landmark }[type] ?? Wallet)
const paidWith = ref<string | null>(null) // payment method id, or 'UNPAID'
watch(methods, (m) => {
  if (!paidWith.value && m.length) paidWith.value = m.find(x => x.type === 'CASH')?.id ?? m[0]!.id
}, { immediate: true })
const selectedMethod = computed(() => methods.value.find(m => m.id === paidWith.value) ?? null)
const reference = ref('')
const cashGiven = ref<number | null>(null)
const change = computed(() => (selectedMethod.value?.type === 'CASH' && cashGiven.value != null && cashGiven.value >= total.value ? cashGiven.value - total.value : null))

// If the cashier has an open cash shift, cash sales are counted in it automatically (shifts are optional).
const { data: shift } = useFetch<{ shift: { id: string } } | null>('/api/admin/shifts/current', { server: false })

// ── Complete ──
const idempotencyKey = ref(newKey())
const { pending, run } = useAction()
const done = ref<Sale | null>(null)
const canComplete = computed(() => lines.value.length > 0 && !!paidWith.value && !pending.value)

async function complete() {
  if (!canComplete.value) return
  const payments = paidWith.value !== 'UNPAID' && total.value > 0
    ? [{
        methodId: paidWith.value!,
        amount: total.value,
        reference: reference.value.trim() || null,
        tendered: selectedMethod.value?.type === 'CASH' && cashGiven.value && cashGiven.value > total.value ? cashGiven.value : null,
      }]
    : []
  const sale = await run(() => apiFetch<Sale>('/api/admin/pos/sale', {
    method: 'POST',
    body: {
      idempotencyKey: idempotencyKey.value,
      lines: lines.value.map(l => ({ variantId: l.variantId, quantity: l.quantity })),
      orderDiscount: discount.value > 0 ? { type: 'FIXED', value: discount.value } : null,
      customerId: customer.value?.id ?? null,
      payments,
      shiftId: shift.value?.shift.id ?? null,
    },
  }))
  if (sale) done.value = sale
}

function newSale() {
  lines.value = []
  showDiscount.value = false
  discountPercent.value = null
  discountFixed.value = null
  showCustomer.value = false
  customer.value = null
  reference.value = ''
  cashGiven.value = null
  paidWith.value = methods.value.find(x => x.type === 'CASH')?.id ?? methods.value[0]?.id ?? null
  idempotencyKey.value = newKey()
  done.value = null
  refreshNuxtData()
  nextTick(() => picker.value?.focus())
}

function onKey(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault()
    if (done.value) newSale()
    else complete()
  }
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_420px]">
    <!-- ───────── Products ───────── -->
    <section class="min-w-0">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-3xl font-semibold tracking-[-0.03em]">New sale</h1>
          <p class="mt-1 text-sm text-ink-muted">Tap a product or scan its barcode.</p>
        </div>
        <NuxtLink v-if="can('shifts.manage')" to="/admin/pos/shifts" class="text-[13px] text-ink-muted hover:text-ink">
          Cash drawer: <span :class="shift ? 'text-positive' : ''">{{ shift ? 'shift open' : 'no shift open' }}</span> ›
        </NuxtLink>
      </div>

      <AdminVariantPicker ref="picker" class="mt-5" autofocus placeholder="Search or scan a barcode…" @select="add" />

      <div class="scrollbar-none mt-4 flex gap-2 overflow-x-auto pb-1">
        <button type="button" class="h-9 shrink-0 rounded-full px-4 text-[13px] font-medium transition" :class="!categoryId ? 'bg-ink text-white' : 'bg-sand-100 text-ink-soft hover:bg-sand-200'" @click="categoryId = null">All</button>
        <button v-for="c in roots" :key="c.id" type="button" class="h-9 shrink-0 rounded-full px-4 text-[13px] font-medium transition" :class="categoryId === c.id ? 'bg-ink text-white' : 'bg-sand-100 text-ink-soft hover:bg-sand-200'" @click="categoryId = c.id">{{ c.name }}</button>
      </div>

      <UiSkeleton v-if="gridStatus === 'pending' && !grid" :rows="2" height="h-48" class="mt-4" />
      <UiEmpty v-else-if="!grid?.length" title="No products here" message="Publish products to sell them at the counter." class="mt-4" />
      <div v-else class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" :class="gridStatus === 'pending' ? 'opacity-60' : ''">
        <button
          v-for="v in grid"
          :key="v.variantId"
          type="button"
          class="group relative overflow-hidden rounded-2xl bg-sand-100 p-2 text-left transition hover:ring-2 hover:ring-accent active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
          :disabled="v.available <= 0"
          @click="add(v)"
        >
          <UiProductImage :image-key="v.imageKey" :alt="v.productName" aspect="aspect-square" rounded="rounded-xl" />
          <span v-if="inCart(v.variantId)" class="absolute right-3 top-3 flex size-7 items-center justify-center rounded-full bg-ink text-xs font-semibold text-white shadow-lift">{{ inCart(v.variantId) }}</span>
          <span class="mt-2 block truncate px-1 text-[13px] font-semibold">{{ v.productName }}</span>
          <span class="block truncate px-1 text-[12px] text-ink-muted">{{ v.title }}</span>
          <span class="mt-1 flex items-center justify-between px-1 pb-1">
            <span class="num text-[13px] font-medium">{{ money(v.price) }}</span>
            <span class="text-[11px]" :class="v.available <= 0 ? 'text-negative' : v.available <= 3 ? 'text-caution' : 'text-ink-faint'">{{ v.available <= 0 ? 'Out' : `${v.available} left` }}</span>
          </span>
        </button>
      </div>
    </section>

    <!-- ───────── Sale panel ───────── -->
    <aside class="xl:sticky xl:top-36 xl:self-start">
      <div class="flex flex-col rounded-3xl border border-sand-200 bg-white shadow-card">
        <div class="flex items-center justify-between px-5 pt-5">
          <h2 class="text-[17px] font-semibold">Current sale</h2>
          <button v-if="lines.length" type="button" class="text-[13px] text-ink-muted hover:text-negative" @click="lines = []">Clear</button>
        </div>

        <!-- Lines -->
        <div class="scrollbar-thin max-h-[38vh] overflow-y-auto px-5 py-3">
          <p v-if="!lines.length" class="py-10 text-center text-sm text-ink-muted">No items yet</p>
          <ul v-else class="divide-y divide-sand-200">
            <li v-for="l in lines" :key="l.variantId" class="flex items-center gap-3 py-3">
              <UiProductImage :image-key="l.imageKey" :alt="l.name" class="size-12 shrink-0" rounded="rounded-lg" />
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium">{{ l.name }}</p>
                <p class="truncate text-xs text-ink-muted">{{ l.title }} · {{ money(l.price) }}</p>
              </div>
              <div class="flex items-center rounded-full bg-sand-100">
                <button type="button" class="flex size-8 items-center justify-center" :aria-label="`One less ${l.name}`" @click="setQty(l, l.quantity - 1)"><component :is="l.quantity === 1 ? Trash2 : Minus" class="size-3.5" /></button>
                <span class="num w-6 text-center text-sm font-medium">{{ l.quantity }}</span>
                <button type="button" class="flex size-8 items-center justify-center" :aria-label="`One more ${l.name}`" @click="setQty(l, l.quantity + 1)"><Plus class="size-3.5" /></button>
              </div>
            </li>
          </ul>
        </div>

        <!-- Extras -->
        <div class="space-y-3 border-t border-sand-200 px-5 py-3">
          <div class="flex flex-wrap gap-2">
            <button v-if="can('pos.discount') && !showDiscount" type="button" class="flex h-8 items-center gap-1.5 rounded-full bg-sand-100 px-3 text-[12px] font-medium text-ink-soft hover:bg-sand-200" @click="showDiscount = true"><Tag class="size-3.5" />Discount</button>
            <button v-if="!showCustomer" type="button" class="flex h-8 items-center gap-1.5 rounded-full bg-sand-100 px-3 text-[12px] font-medium text-ink-soft hover:bg-sand-200" @click="showCustomer = true"><UserRound class="size-3.5" />Customer</button>
          </div>
          <div v-if="showDiscount" class="flex items-center gap-2">
            <div class="flex rounded-full bg-sand-100 p-0.5 text-[12px] font-medium">
              <button type="button" class="rounded-full px-3 py-1.5" :class="discountType === 'PERCENT' ? 'bg-white shadow-lift' : 'text-ink-muted'" @click="discountType = 'PERCENT'">%</button>
              <button type="button" class="rounded-full px-3 py-1.5" :class="discountType === 'FIXED' ? 'bg-white shadow-lift' : 'text-ink-muted'" @click="discountType = 'FIXED'">KES</button>
            </div>
            <input v-if="discountType === 'PERCENT'" v-model.number="discountPercent" type="number" min="0" max="100" placeholder="0" aria-label="Discount percent" class="field h-9 w-24">
            <UiMoneyInput v-else v-model="discountFixed" nullable class="w-36" />
            <button type="button" class="ml-auto rounded-full p-1.5 text-ink-muted hover:text-ink" aria-label="Remove discount" @click="showDiscount = false"><X class="size-4" /></button>
          </div>
          <div v-if="showCustomer" class="flex items-start gap-2">
            <SalesCustomerPicker v-model="customer" class="flex-1" />
            <button type="button" class="mt-2 rounded-full p-1.5 text-ink-muted hover:text-ink" aria-label="Remove customer" @click="showCustomer = false; customer = null"><X class="size-4" /></button>
          </div>
        </div>

        <!-- Total -->
        <div class="border-t border-sand-200 px-5 py-4">
          <div v-if="discount" class="flex justify-between text-sm text-ink-muted"><span>Subtotal</span><span class="num">{{ money(subtotal) }}</span></div>
          <div v-if="discount" class="flex justify-between text-sm text-ink-muted"><span>Discount</span><span class="num">− {{ money(discount) }}</span></div>
          <div class="flex items-end justify-between">
            <span class="text-[15px] font-medium">Total</span>
            <span class="num text-4xl font-semibold tracking-[-0.03em]">{{ money(total) }}</span>
          </div>
        </div>

        <!-- How they paid -->
        <div class="border-t border-sand-200 px-5 py-4">
          <p class="mb-3 text-[13px] font-medium text-ink-muted">How did they pay?</p>
          <div class="grid grid-cols-3 gap-2">
            <button
              v-for="m in methods"
              :key="m.id"
              type="button"
              class="flex h-16 flex-col items-center justify-center gap-1 rounded-2xl border text-[12px] font-medium transition"
              :class="paidWith === m.id ? 'border-ink bg-ink text-white' : 'border-sand-200 hover:border-ink-muted'"
              :aria-pressed="paidWith === m.id"
              @click="paidWith = m.id"
            >
              <component :is="icon(m.type)" class="size-5" />
              <span class="max-w-full truncate px-1">{{ m.name.replace(' (external terminal)', '') }}</span>
            </button>
            <button
              type="button"
              class="flex h-16 flex-col items-center justify-center gap-1 rounded-2xl border text-[12px] font-medium transition"
              :class="paidWith === 'UNPAID' ? 'border-caution bg-caution-tint text-caution' : 'border-sand-200 text-ink-muted hover:border-ink-muted'"
              :aria-pressed="paidWith === 'UNPAID'"
              @click="paidWith = 'UNPAID'"
            >
              <CircleSlash class="size-5" />Not paid yet
            </button>
          </div>
          <div v-if="selectedMethod && selectedMethod.type !== 'CASH'" class="mt-3">
            <input v-model="reference" :aria-label="`${selectedMethod.name} code (optional)`" :placeholder="`${selectedMethod.name} code (optional)`" class="field h-10 uppercase" autocomplete="off">
          </div>
          <div v-else-if="selectedMethod?.type === 'CASH'" class="mt-3 flex items-center gap-3">
            <UiMoneyInput v-model="cashGiven" nullable placeholder="Cash given (optional)" class="flex-1" />
            <span v-if="change != null" class="num whitespace-nowrap text-sm">Change <b>{{ money(change) }}</b></span>
          </div>
          <p v-if="paidWith === 'UNPAID'" class="mt-3 text-xs text-caution">The sale is recorded with the full amount outstanding. Record the payment later from the order.</p>
        </div>

        <div class="px-5 pb-5">
          <button
            type="button"
            class="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-ink text-[16px] font-semibold text-white shadow-pill transition hover:bg-ink-soft disabled:opacity-40"
            :disabled="!canComplete"
            @click="complete"
          >
            <Check class="size-5" />{{ pending ? 'Saving…' : lines.length ? `Complete sale · ${money(total)}` : 'Add items to start' }}
          </button>
          <p class="mt-2 text-center text-[11px] text-ink-faint">Ctrl + Enter</p>
        </div>
      </div>
    </aside>

    <!-- ───────── Done ───────── -->
    <UiModal :open="!!done" title="Sale complete" size="sm" persistent @update:open="v => !v && newSale()">
      <div v-if="done" class="py-2 text-center">
        <span class="mx-auto flex size-16 items-center justify-center rounded-full bg-positive-tint text-positive"><Check class="size-8" /></span>
        <p class="num mt-4 text-4xl font-semibold tracking-[-0.03em]">{{ money(done.total) }}</p>
        <p class="mt-1 text-sm text-ink-muted">{{ done.number }} · {{ done.payments[0]?.method.name ?? 'Not paid yet' }}</p>
        <p v-if="change" class="mt-3 rounded-xl bg-accent-tint py-2 text-sm text-accent-dark">Give change: <b class="num">{{ money(change) }}</b></p>
      </div>
      <template #footer>
        <UiButton v-if="done" :to="`/admin/orders/${done.id}/receipt`" variant="light" :icon="Printer">Print receipt</UiButton>
        <UiButton autofocus @click="newSale">New sale</UiButton>
      </template>
    </UiModal>
  </div>
</template>
