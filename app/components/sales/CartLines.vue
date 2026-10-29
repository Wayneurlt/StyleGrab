<script lang="ts">
import { Minus, Plus, SlidersHorizontal, Trash2 } from 'lucide-vue-next'
import { percentOf } from '#shared/money'
import type { PickedVariant } from '~/components/admin/VariantPicker.vue'

export interface Discount { type: 'FIXED' | 'PERCENT', value: number }

export interface EditLine {
  key: string
  variantId: string
  productName: string
  title: string
  sku: string
  imageKey: string | null
  price: number
  available: number
  quantity: number
  /** Staff price override (minor units) or null for the catalogue price. */
  unitPrice: number | null
  discount: Discount | null
}

function discountAmount(base: number, d: Discount | null | undefined) {
  if (!d || !d.value) return 0
  return Math.min(base, d.type === 'PERCENT' ? percentOf(base, Math.min(d.value, 10_000)) : d.value)
}

/** Client-side preview mirroring the server's pricing. The server's totals are authoritative. */
export function previewTotals(lines: EditLine[], orderDiscount: Discount | null) {
  const rows = lines.map((l) => {
    const unit = l.unitPrice ?? l.price
    const gross = unit * l.quantity
    const disc = discountAmount(gross, l.discount)
    return { gross, disc, net: gross - disc }
  })
  const afterLine = rows.reduce((s, r) => s + r.net, 0)
  const orderDisc = discountAmount(afterLine, orderDiscount)
  const subtotal = rows.reduce((s, r) => s + r.gross, 0)
  const discountTotal = rows.reduce((s, r) => s + r.disc, 0) + orderDisc
  return { rows, subtotal, discountTotal, orderDisc, total: subtotal - discountTotal }
}

export function addVariant(lines: EditLine[], v: PickedVariant, qty = 1) {
  const existing = lines.find(l => l.variantId === v.variantId && l.unitPrice == null && !l.discount)
  if (existing) existing.quantity = Math.min(999, existing.quantity + qty)
  else lines.push({ key: crypto.randomUUID(), variantId: v.variantId, productName: v.productName, title: v.title, sku: v.sku, imageKey: v.imageKey, price: v.price, available: v.available, quantity: qty, unitPrice: null, discount: null })
}

export function toLinePayload(lines: EditLine[]) {
  return lines.map(l => ({
    variantId: l.variantId,
    quantity: l.quantity,
    unitPrice: l.unitPrice != null && l.unitPrice !== l.price ? l.unitPrice : undefined,
    discount: l.discount && l.discount.value > 0 ? l.discount : undefined,
  }))
}

/** Same rule as the server: total − returned goods − (paid − refunded), never negative. */
export function outstanding(o: { total: number, amountReturned: number, amountPaid: number, amountRefunded: number }) {
  return Math.max(0, o.total - o.amountReturned - (o.amountPaid - o.amountRefunded))
}

export function discountPayload(d: Discount | null) {
  return d && d.value > 0 ? d : undefined
}
</script>

<script setup lang="ts">
const lines = defineModel<EditLine[]>({ required: true })
const props = withDefaults(defineProps<{ allowDiscount?: boolean, allowOverride?: boolean, compact?: boolean, warnStock?: boolean }>(), { warnStock: true })
const { money } = useFormat()
const expanded = ref<string | null>(null)
const preview = computed(() => previewTotals(lines.value, null))

function step(l: EditLine, d: number) {
  const q = l.quantity + d
  if (q <= 0) remove(l)
  else l.quantity = Math.min(999, q)
}
function remove(l: EditLine) {
  lines.value = lines.value.filter(x => x.key !== l.key)
}
function setQty(l: EditLine, e: Event) {
  const n = Math.floor(Number((e.target as HTMLInputElement).value))
  if (Number.isFinite(n) && n > 0) l.quantity = Math.min(999, n)
}
function setDiscountType(l: EditLine, type: 'FIXED' | 'PERCENT') {
  l.discount = { type, value: 0 }
}
function percentValue(l: EditLine) {
  return l.discount?.type === 'PERCENT' ? l.discount.value / 100 : 0
}
function setPercent(l: EditLine, e: Event) {
  const n = Number((e.target as HTMLInputElement).value)
  l.discount = { type: 'PERCENT', value: Number.isFinite(n) ? Math.max(0, Math.min(10_000, Math.round(n * 100))) : 0 }
}
const canAdjust = computed(() => props.allowDiscount || props.allowOverride)
</script>

<template>
  <ul class="space-y-2">
    <li v-for="(l, i) in lines" :key="l.key" class="rounded-2xl border border-sand-200 bg-sand-50 p-2.5">
      <div class="flex items-center gap-3">
        <UiProductImage v-if="!compact" :image-key="l.imageKey" :alt="l.productName" class="size-11 shrink-0" rounded="rounded-xl" />
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium">{{ l.productName }}</p>
          <p class="truncate text-xs text-ink-muted">{{ l.title }} · {{ l.sku }}</p>
          <p v-if="warnStock && l.quantity > l.available" class="text-xs font-medium text-negative">Only {{ Math.max(l.available, 0) }} available</p>
        </div>
        <div class="flex items-center rounded-full border border-sand-200 bg-white/80">
          <button type="button" class="flex size-8 items-center justify-center rounded-full hover:bg-sand-50" :aria-label="`Decrease ${l.productName}`" @click="step(l, -1)"><Minus class="size-3.5" /></button>
          <input :value="l.quantity" type="number" min="1" max="999" class="num w-10 bg-transparent text-center text-sm outline-none" :aria-label="`Quantity of ${l.productName} ${l.title}`" @change="setQty(l, $event)">
          <button type="button" class="flex size-8 items-center justify-center rounded-full hover:bg-sand-50" :aria-label="`Increase ${l.productName}`" @click="step(l, 1)"><Plus class="size-3.5" /></button>
        </div>
        <div class="w-24 text-right">
          <p class="num text-sm font-semibold">{{ money(preview.rows[i]?.net ?? 0) }}</p>
          <p v-if="(preview.rows[i]?.disc ?? 0) > 0 || l.unitPrice != null" class="num text-[11px] text-ink-muted line-through">{{ money(l.price * l.quantity) }}</p>
        </div>
        <UiIconButton v-if="canAdjust" :icon="SlidersHorizontal" :label="`Adjust price or discount for ${l.productName}`" size="sm" :active="expanded === l.key" @click="expanded = expanded === l.key ? null : l.key" />
        <UiIconButton :icon="Trash2" :label="`Remove ${l.productName}`" size="sm" @click="remove(l)" />
      </div>
      <div v-if="expanded === l.key" class="mt-3 grid gap-3 border-t border-sand-200 pt-3 sm:grid-cols-2">
        <UiField v-if="allowOverride" :id="`price-${l.key}`" label="Unit price" :hint="`Catalogue price ${money(l.price)}`">
          <UiMoneyInput :id="`price-${l.key}`" :model-value="l.unitPrice ?? l.price" @update:model-value="(v) => (l.unitPrice = v === l.price ? null : v)" />
        </UiField>
        <div v-if="allowDiscount" class="space-y-1.5">
          <span class="label block">Line discount</span>
          <div class="flex gap-2">
            <select class="field w-24" :value="l.discount?.type ?? 'FIXED'" aria-label="Discount type" @change="setDiscountType(l, ($event.target as HTMLSelectElement).value as 'FIXED' | 'PERCENT')">
              <option value="FIXED">Amount</option>
              <option value="PERCENT">%</option>
            </select>
            <input v-if="l.discount?.type === 'PERCENT'" :value="percentValue(l)" type="number" min="0" max="100" step="0.5" class="field num" aria-label="Discount percent" @input="setPercent(l, $event)">
            <UiMoneyInput v-else :model-value="l.discount?.value ?? 0" aria-label="Discount amount" @update:model-value="(v) => (l.discount = { type: 'FIXED', value: v ?? 0 })" />
          </div>
        </div>
      </div>
    </li>
  </ul>
</template>
