<script setup lang="ts">
import { ArrowLeft, Check, Copy, Download, Mail, MessageCircle, Printer, RotateCcw, Share2 } from 'lucide-vue-next'
import { formatMoney } from '#shared/money'
import { PAYMENT_RECORD_STATUS, PAYMENT_STATUS } from '#shared/labels'
import type { getOrderDetail } from '~~/server/services/orders'

definePageMeta({ layout: false })

/** Response of GET /api/admin/orders/:id (order detail plus balance and business details). */
type OrderReceipt = Awaited<ReturnType<typeof getOrderDetail>> & {
  balance: number
  business: { name: string, phone: string, email: string, address: string, receiptFooter: string, returnPolicy: string, currency: string, timezone: string }
}

const route = useRoute()
const id = computed(() => String(route.params.id))
const { data: order, error, refresh } = useFetch<OrderReceipt>(() => String(`/api/admin/orders/${id.value}`), { server: false })
useHead({ title: () => (order.value ? `Receipt ${order.value.number}` : 'Receipt') })
const toast = useToast()

const m = (v: number | null | undefined) => formatMoney(v, order.value?.business.currency ?? 'KES')
const when = (d: string | Date | null | undefined) => (d
  ? new Intl.DateTimeFormat('en-GB', { timeZone: order.value?.business.timezone ?? 'Africa/Nairobi', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(d))
  : '')
const cashier = computed(() => (order.value?.createdById ? order.value.users[order.value.createdById] : null))
const activePayments = computed(() => order.value?.payments.filter(p => p.status === 'CONFIRMED' || p.status === 'PENDING_CONFIRMATION') ?? [])
const customerName = computed(() => order.value?.customer?.name ?? order.value?.contactName ?? null)
const customerPhone = computed(() => order.value?.customer?.phone ?? order.value?.contactPhone ?? null)
const customerEmail = computed(() => order.value?.customer?.email ?? order.value?.contactEmail ?? null)

// ── Printer animation ──────────────────────────────────────────────────────
// The paper feeds out of the slot in short stutters, like a thermal printer. Plays once when the receipt
// loads (and on "Print again"); skipped entirely for reduced motion. Printing on paper is unaffected.
const printing = ref(false)
const feedKey = ref(0)
let printTimer: ReturnType<typeof setTimeout> | undefined
function playFeed() {
  if (!import.meta.client) return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  clearTimeout(printTimer)
  feedKey.value++
  printing.value = true
  printTimer = setTimeout(() => (printing.value = false), 2900)
}
watch(order, (o, prev) => {
  if (o && !prev) nextTick(playFeed)
})
onBeforeUnmount(() => clearTimeout(printTimer))

function printNow() {
  window.print()
}

// ── Share ──────────────────────────────────────────────────────────────────
const receiptEl = ref<HTMLElement | null>(null)
const shareOpen = ref(false)
const busy = ref<string | null>(null)
const canShareFiles = ref(false)
onMounted(() => {
  try {
    const probe = new File([''], 'probe.png', { type: 'image/png' })
    canShareFiles.value = typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [probe] })
  }
  catch {
    canShareFiles.value = false
  }
})

/** Plain-text version for WhatsApp, email and the clipboard. */
const receiptText = computed(() => {
  const o = order.value
  if (!o) return ''
  const lines = [
    `*${o.business.name}* — Sales receipt`,
    `Receipt: ${o.number}`,
    `Date: ${when(o.completedAt ?? o.placedAt)}`,
    ...(customerName.value ? [`Customer: ${customerName.value}`] : []),
    '',
    ...o.items.map(i => `${i.quantity} × ${i.productName} (${i.variantTitle}) — ${m(i.lineTotal)}`),
    '',
    ...(o.discountTotal ? [`Discounts: −${m(o.discountTotal)}`] : []),
    `*Total: ${m(o.total)}*`,
    ...activePayments.value.map(p => `Paid: ${p.method.name} ${m(p.amount)}${p.reference ? ` (ref ${p.reference})` : ''}`),
    ...(o.balance > 0 ? [`Balance due: ${m(o.balance)}`] : []),
    `Status: ${PAYMENT_STATUS[o.paymentStatus]?.label ?? o.paymentStatus}`,
    ...(o.business.receiptFooter ? ['', o.business.receiptFooter] : []),
  ]
  return lines.join('\n')
})

async function renderImage(): Promise<Blob> {
  if (!receiptEl.value) throw new Error('Receipt is not ready yet')
  const { toBlob } = await import('html-to-image')
  const blob = await toBlob(receiptEl.value, { backgroundColor: '#ffffff', pixelRatio: 2, cacheBust: true, style: { transform: 'none', boxShadow: 'none', maskImage: 'none', webkitMaskImage: 'none' } })
  if (!blob) throw new Error('Could not create the receipt image')
  return blob
}
const fileName = computed(() => `Receipt-${order.value?.number ?? 'StyleGrab'}.png`)

async function run(action: string, fn: () => Promise<void> | void) {
  busy.value = action
  try {
    await fn()
    shareOpen.value = false
  }
  catch (e) {
    // The user closing the native share sheet is not an error.
    if ((e as Error)?.name !== 'AbortError') toast.error((e as Error)?.message || 'Sharing failed. Try Download image instead.')
  }
  finally {
    busy.value = null
  }
}

const shareImage = () => run('native', async () => {
  const file = new File([await renderImage()], fileName.value, { type: 'image/png' })
  await navigator.share({ files: [file], title: `Receipt ${order.value?.number}`, text: `${order.value?.business.name} receipt ${order.value?.number}` })
})

const shareWhatsApp = () => run('whatsapp', () => {
  let digits = (customerPhone.value ?? '').replace(/\D/g, '')
  if (digits.startsWith('0') && digits.length === 10) digits = `254${digits.slice(1)}`
  const url = `https://wa.me/${digits}?text=${encodeURIComponent(receiptText.value)}`
  window.open(url, '_blank', 'noopener')
})

const shareEmail = () => run('email', () => {
  const subject = `${order.value?.business.name} receipt ${order.value?.number}`
  window.location.href = `mailto:${encodeURIComponent(customerEmail.value ?? '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(receiptText.value.replace(/\*/g, ''))}`
})

const downloadImage = () => run('download', async () => {
  const url = URL.createObjectURL(await renderImage())
  const a = document.createElement('a')
  a.href = url
  a.download = fileName.value
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
  toast.success('Receipt image downloaded')
})

const copyText = () => run('copy', async () => {
  await navigator.clipboard.writeText(receiptText.value.replace(/\*/g, ''))
  toast.success('Receipt copied — paste it into any chat')
})

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') shareOpen.value = false
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="receipt-page min-h-screen bg-[#ececee] text-black">
    <!-- Toolbar -->
    <div class="no-print sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-black/10 bg-[#ececee]/90 px-4 py-3 backdrop-blur">
      <NuxtLink :to="`/admin/orders/${id}`" class="inline-flex items-center gap-1.5 text-sm text-neutral-700 hover:text-black"><ArrowLeft class="size-4" />Back to order</NuxtLink>
      <div class="flex items-center gap-2">
        <div class="relative" @focusout="(e: FocusEvent) => !(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node) && (shareOpen = false)">
          <button type="button" class="inline-flex h-10 items-center gap-2 rounded-full border border-black/15 bg-white px-5 text-sm font-medium text-black transition hover:border-black/40 disabled:opacity-50" :disabled="!order" :aria-expanded="shareOpen" aria-haspopup="menu" @click="shareOpen = !shareOpen">
            <Share2 class="size-4" />Share
          </button>
          <Transition enter-from-class="opacity-0 -translate-y-1" leave-to-class="opacity-0" enter-active-class="transition duration-150" leave-active-class="transition duration-100">
            <div v-if="shareOpen" role="menu" class="absolute right-0 top-12 w-64 rounded-2xl border border-black/10 bg-white p-1.5 text-sm text-black shadow-[0_20px_50px_-20px_rgba(0,0,0,0.35)]">
              <button v-if="canShareFiles" role="menuitem" type="button" class="share-item" :disabled="!!busy" @click="shareImage">
                <Share2 class="size-4" /><span class="flex-1">Share image…</span><span v-if="busy === 'native'" class="spinner" />
              </button>
              <button role="menuitem" type="button" class="share-item" :disabled="!!busy" @click="shareWhatsApp">
                <MessageCircle class="size-4 text-[#25d366]" /><span class="flex-1">WhatsApp<span v-if="customerPhone" class="block text-[11px] text-neutral-500">to {{ customerPhone }}</span></span>
              </button>
              <button role="menuitem" type="button" class="share-item" :disabled="!!busy" @click="shareEmail">
                <Mail class="size-4" /><span class="flex-1">Email<span v-if="customerEmail" class="block text-[11px] text-neutral-500">to {{ customerEmail }}</span></span>
              </button>
              <div class="my-1 h-px bg-black/10" />
              <button role="menuitem" type="button" class="share-item" :disabled="!!busy" @click="downloadImage">
                <Download class="size-4" /><span class="flex-1">Download image</span><span v-if="busy === 'download'" class="spinner" />
              </button>
              <button role="menuitem" type="button" class="share-item" :disabled="!!busy" @click="copyText">
                <Copy class="size-4" /><span class="flex-1">Copy as text</span><Check v-if="busy === 'copy'" class="size-4" />
              </button>
            </div>
          </Transition>
        </div>
        <button type="button" class="inline-flex h-10 items-center gap-2 rounded-full bg-black px-5 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:opacity-50" :disabled="!order" @click="printNow"><Printer class="size-4" />Print</button>
      </div>
    </div>

    <div v-if="error" class="p-8 text-center text-sm">
      <p>{{ apiError(error) }}</p>
      <button type="button" class="mt-3 underline" @click="refresh()">Try again</button>
    </div>
    <p v-else-if="!order" class="p-8 text-center text-sm text-neutral-500">Loading receipt…</p>

    <div v-else class="stage flex flex-col items-center px-4 pb-16 pt-10">
      <!-- Printer -->
      <div class="printer no-print" :class="printing ? 'is-printing' : ''" aria-hidden="true">
        <div class="printer-body">
          <span class="printer-brand">StyleGrab</span>
          <span class="printer-led" />
        </div>
        <div class="printer-slot" />
      </div>

      <!-- Paper coming out of the slot -->
      <div class="paper-well">
        <div :key="feedKey" class="paper-feed" :class="feedKey ? 'is-feeding' : ''">
          <article ref="receiptEl" class="receipt bg-white px-5 pb-10 pt-6 font-mono text-[12px] leading-snug text-black">
            <header class="text-center">
              <p class="font-sans text-lg font-bold tracking-tight">{{ order.business.name }}</p>
              <p v-if="order.business.address" class="whitespace-pre-line">{{ order.business.address }}</p>
              <p v-if="order.business.phone">{{ order.business.phone }}</p>
              <p v-if="order.business.email">{{ order.business.email }}</p>
              <p class="mt-3 font-sans text-[13px] font-semibold uppercase tracking-wide">Sales receipt</p>
              <p class="text-[10px] text-neutral-600">Not a tax invoice</p>
            </header>

            <div class="my-3 border-t border-dashed border-black" />
            <div class="space-y-0.5">
              <p class="flex justify-between gap-3"><span>Receipt</span><b>{{ order.number }}</b></p>
              <p class="flex justify-between gap-3"><span>Date</span><span class="text-right">{{ when(order.completedAt ?? order.placedAt) }}</span></p>
              <p v-if="cashier" class="flex justify-between gap-3"><span>Served by</span><span>{{ cashier }}</span></p>
              <p v-if="customerName" class="flex justify-between gap-3"><span>Customer</span><span class="text-right">{{ customerName }}</span></p>
            </div>
            <div class="my-3 border-t border-dashed border-black" />

            <ul class="space-y-2">
              <li v-for="i in order.items" :key="i.id">
                <p class="font-semibold">{{ i.productName }}</p>
                <p class="text-neutral-700">{{ i.variantTitle }} · {{ i.sku }}</p>
                <p class="flex justify-between"><span>{{ i.quantity }} × {{ m(i.unitPrice) }}</span><span>{{ m(i.quantity * i.unitPrice) }}</span></p>
                <p v-if="i.lineDiscount + i.orderDiscountShare" class="flex justify-between text-neutral-700"><span>Discount</span><span>−{{ m(i.lineDiscount + i.orderDiscountShare) }}</span></p>
                <p v-if="i.returnedQty" class="text-neutral-700">({{ i.returnedQty }} returned)</p>
              </li>
            </ul>

            <div class="my-3 border-t border-dashed border-black" />
            <div class="space-y-0.5">
              <p class="flex justify-between"><span>Subtotal</span><span>{{ m(order.subtotal) }}</span></p>
              <p v-if="order.discountTotal" class="flex justify-between"><span>Discounts</span><span>−{{ m(order.discountTotal) }}</span></p>
              <p class="flex justify-between text-[14px] font-bold"><span>TOTAL</span><span>{{ m(order.total) }}</span></p>
              <p v-if="order.amountReturned" class="flex justify-between"><span>Returned</span><span>−{{ m(order.amountReturned) }}</span></p>
            </div>

            <div class="my-3 border-t border-dashed border-black" />
            <p class="mb-1 font-semibold">Payments</p>
            <p v-if="!activePayments.length">None recorded</p>
            <div v-for="p in activePayments" :key="p.id" class="mb-1">
              <p class="flex justify-between"><span>{{ p.method.name }}</span><span>{{ m(p.amount) }}</span></p>
              <p v-if="p.tendered && p.tendered > p.amount" class="flex justify-between text-neutral-700"><span>Tendered / change</span><span>{{ m(p.tendered) }} / {{ m(p.tendered - p.amount) }}</span></p>
              <p v-if="p.reference" class="text-neutral-700">Ref {{ p.reference }}</p>
              <p class="text-neutral-700">{{ PAYMENT_RECORD_STATUS[p.status]?.label }}</p>
            </div>
            <p v-for="r in order.refunds" :key="r.id" class="flex justify-between"><span>Refund · {{ r.method.name }}</span><span>−{{ m(r.amount) }}</span></p>
            <p class="mt-1 flex justify-between font-semibold"><span>Payment status</span><span>{{ PAYMENT_STATUS[order.paymentStatus]?.label }}</span></p>
            <p v-if="order.balance > 0" class="flex justify-between font-bold"><span>BALANCE DUE</span><span>{{ m(order.balance) }}</span></p>

            <div class="my-3 border-t border-dashed border-black" />
            <footer class="space-y-2 text-center">
              <p v-if="order.business.receiptFooter" class="whitespace-pre-line">{{ order.business.receiptFooter }}</p>
              <p v-if="order.business.returnPolicy" class="whitespace-pre-line text-[10px] text-neutral-700">{{ order.business.returnPolicy }}</p>
              <p class="pt-1 text-[10px] text-neutral-500">✦ ✦ ✦</p>
            </footer>
          </article>
        </div>
      </div>

      <button type="button" class="no-print mt-6 inline-flex items-center gap-1.5 text-[13px] text-neutral-500 transition hover:text-black disabled:opacity-40" :disabled="printing" @click="playFeed">
        <RotateCcw class="size-3.5" />Print again
      </button>
    </div>
  </div>
</template>

<style scoped>
/* ── Printer ─────────────────────────────────────────────────────────── */
.printer { position: relative; z-index: 2; width: 380px; max-width: calc(100vw - 2rem); }
.printer-body {
  position: relative; height: 92px; border-radius: 22px 22px 14px 14px;
  background: linear-gradient(180deg, #2a2a2d 0%, #141416 70%, #0b0b0c 100%);
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.08) inset, 0 24px 40px -18px rgba(0, 0, 0, 0.55);
  display: flex; align-items: center; justify-content: space-between; padding: 0 26px;
}
.printer-brand { font: 600 13px/1 Inter, system-ui, sans-serif; letter-spacing: 0.32em; text-transform: uppercase; color: #e4c25a; }
.printer-led { width: 9px; height: 9px; border-radius: 9999px; background: #3a3a3c; box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.05); transition: background 0.3s; }
.printer-slot {
  position: relative; margin: -14px auto 0; width: 342px; max-width: calc(100% - 38px); height: 14px;
  border-radius: 0 0 10px 10px; background: #050506; box-shadow: 0 6px 10px -6px rgba(0, 0, 0, 0.7) inset;
}
.is-printing .printer-body { animation: hum 0.12s linear infinite; }
.is-printing .printer-led { background: #34d399; box-shadow: 0 0 10px 2px rgba(52, 211, 153, 0.7); animation: blink 0.5s steps(2) infinite; }
@keyframes hum { 0%, 100% { transform: translate(0, 0); } 25% { transform: translate(0.4px, -0.3px); } 75% { transform: translate(-0.4px, 0.3px); } }
@keyframes blink { 50% { opacity: 0.35; } }

/* ── Paper ───────────────────────────────────────────────────────────── */
/* The well starts just inside the slot and clips the paper, so it appears to come out of the printer. */
.paper-well { position: relative; z-index: 1; margin-top: -8px; width: 320px; max-width: calc(100vw - 3rem); overflow: hidden; padding: 0 10px 24px; }
.paper-feed { will-change: transform; }
.paper-feed.is-feeding { animation: feed 2.8s cubic-bezier(0.45, 0.05, 0.3, 1) both; }
/* Stutter-feed: the paper advances in short bursts with tiny pauses, like a thermal print head. */
@keyframes feed {
  0% { transform: translateY(-100%); }
  12% { transform: translateY(-86%); }
  18% { transform: translateY(-85%); }
  34% { transform: translateY(-62%); }
  40% { transform: translateY(-61%); }
  58% { transform: translateY(-36%); }
  64% { transform: translateY(-35%); }
  84% { transform: translateY(-8%); }
  90% { transform: translateY(-7%); }
  100% { transform: translateY(0); }
}
.receipt {
  box-shadow: 0 18px 30px -18px rgba(0, 0, 0, 0.45), 0 2px 6px rgba(0, 0, 0, 0.06);
  /* Torn zig-zag bottom edge. */
  --tear: 10px;
  -webkit-mask: linear-gradient(#000 0 0) top / 100% calc(100% - var(--tear)) no-repeat, conic-gradient(from -45deg at bottom, #0000, #000 1deg 89deg, #0000 90deg) bottom / calc(var(--tear) * 2) var(--tear) repeat-x;
  mask: linear-gradient(#000 0 0) top / 100% calc(100% - var(--tear)) no-repeat, conic-gradient(from -45deg at bottom, #0000, #000 1deg 89deg, #0000 90deg) bottom / calc(var(--tear) * 2) var(--tear) repeat-x;
}
/* Faint paper texture line at the very top, where it was cut. */
.receipt::before { content: ''; display: block; height: 1px; margin: -24px -20px 23px; background: rgba(0, 0, 0, 0.06); }

.share-item { display: flex; width: 100%; align-items: center; gap: 0.75rem; border-radius: 0.75rem; padding: 0.6rem 0.75rem; text-align: left; transition: background 0.15s; }
.share-item:hover:not(:disabled) { background: #f3f3f5; }
.share-item:disabled { opacity: 0.6; }
.spinner { width: 14px; height: 14px; border-radius: 9999px; border: 2px solid #d4d4d8; border-top-color: #111; animation: spin 0.7s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

@media (prefers-reduced-motion: reduce) {
  .paper-feed.is-feeding, .is-printing .printer-body, .is-printing .printer-led { animation: none; }
}

@media print {
  .receipt-page { background: #fff !important; min-height: 0; }
  .stage { padding: 0 !important; }
  .paper-well { width: auto; max-width: none; overflow: visible; margin: 0; padding: 0; }
  .paper-feed { animation: none !important; transform: none !important; }
  .receipt { box-shadow: none; -webkit-mask: none; mask: none; padding: 0; }
  .receipt::before { display: none; }
}
</style>

<style>
@media print {
  @page { margin: 4mm; }
}
</style>
