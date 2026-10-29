<script setup lang="ts">
import { Trash2 } from 'lucide-vue-next'
import type { PickedVariant } from '~/components/admin/VariantPicker.vue'

definePageMeta({ layout: 'admin' })
useHead({ title: 'Receive stock' })

interface Line { variantId: string, label: string, sku: string, receivedQty: number, acceptedQty: number, damagedQty: number, unitCost: number | null, notes: string, ordered?: number, alreadyReceived?: number }
interface PoDetail {
  id: string
  number: string
  supplierId: string
  status: string
  items: { variantId: string, orderedQty: number, receivedQty: number, unitCost: number, variant?: { sku: string, title: string, product: { name: string } } }[]
}

const route = useRoute()
const { money, today } = useFormat()
const { pending, run } = useAction()
const { confirm } = useConfirm()
const idempotencyKey = newKey()

const { data: suppliers } = useFetch('/api/admin/suppliers', { server: false, query: { pageSize: 100 } })
const { data: openPos } = useFetch('/api/admin/purchase-orders', { server: false, query: { status: 'OPEN', pageSize: 100 } })

const supplierId = ref('')
const poId = ref(typeof route.query.po === 'string' ? route.query.po : '')
const reference = ref('')
const receivedAt = ref(today())
const notes = ref('')
const lines = ref<Line[]>([])
const error = ref<string | null>(null)
const loadingPo = ref(false)

watch(poId, async (id) => {
  if (!id) return
  if (lines.value.length && !(await confirm({ title: 'Replace lines?', message: 'Selecting a purchase order replaces the current lines with its outstanding items.', confirmLabel: 'Replace' }))) return
  loadingPo.value = true
  try {
    const po = await apiFetch<PoDetail>(`/api/admin/purchase-orders/${id}`)
    supplierId.value = po.supplierId
    lines.value = po.items.filter(i => i.orderedQty > i.receivedQty).map((i) => {
      const remaining = i.orderedQty - i.receivedQty
      return { variantId: i.variantId, label: i.variant ? `${i.variant.product.name} · ${i.variant.title}` : i.variantId, sku: i.variant?.sku ?? '', receivedQty: remaining, acceptedQty: remaining, damagedQty: 0, unitCost: i.unitCost, notes: '', ordered: i.orderedQty, alreadyReceived: i.receivedQty }
    })
    if (!lines.value.length) useToast().info(`${po.number} has nothing left to receive`)
  }
  catch (e) {
    useToast().error(apiError(e))
  }
  finally {
    loadingPo.value = false
  }
}, { immediate: true })

function add(v: PickedVariant) {
  if (poId.value) {
    useToast().error('Lines on a purchase-order receipt come from the purchase order')
    return
  }
  const existing = lines.value.find(l => l.variantId === v.variantId)
  if (existing) {
    existing.receivedQty++
    existing.acceptedQty = existing.receivedQty - existing.damagedQty
    return
  }
  lines.value.push({ variantId: v.variantId, label: `${v.productName} · ${v.title}`, sku: v.sku, receivedQty: 1, acceptedQty: 1, damagedQty: 0, unitCost: null, notes: '' })
}
function sync(l: Line) {
  l.acceptedQty = Math.max(0, (l.receivedQty || 0) - (l.damagedQty || 0))
}

const total = computed(() => lines.value.reduce((s, l) => s + (l.acceptedQty || 0) * (l.unitCost ?? 0), 0))

function validate(): string | null {
  const active = lines.value.filter(l => l.receivedQty > 0)
  if (!active.length) return 'Add at least one received item'
  for (const l of lines.value) {
    if ([l.receivedQty, l.acceptedQty, l.damagedQty].some(n => !Number.isInteger(n) || n < 0)) return `${l.sku}: quantities must be whole numbers`
    if (l.acceptedQty + l.damagedQty > l.receivedQty) return `${l.sku}: accepted + damaged cannot exceed received`
    if (l.receivedQty > 0 && l.unitCost == null) return `${l.sku}: enter the unit cost`
  }
  return null
}

async function submit() {
  error.value = validate()
  if (error.value) return
  const units = lines.value.reduce((s, l) => s + l.acceptedQty, 0)
  if (!(await confirm({ title: 'Record this delivery?', message: `${units} accepted unit(s) will be added to sellable stock. This cannot be edited afterwards; mistakes are corrected with an adjustment.`, confirmLabel: 'Record delivery' }))) return
  const r = await run(() => apiFetch<{ number: string }>('/api/admin/inventory/receipts', {
    method: 'POST',
    body: {
      purchaseOrderId: poId.value || null,
      supplierId: supplierId.value || null,
      reference: reference.value || null,
      receivedAt: receivedAt.value,
      notes: notes.value || null,
      idempotencyKey,
      items: lines.value.filter(l => l.receivedQty > 0).map(l => ({ variantId: l.variantId, receivedQty: l.receivedQty, acceptedQty: l.acceptedQty, damagedQty: l.damagedQty, unitCost: l.unitCost ?? 0, notes: l.notes || null })),
    },
  }))
  if (r) {
    useToast().success(`Delivery ${r.number} recorded`)
    await navigateTo('/admin/inventory/receiving')
  }
}
</script>

<template>
  <div>
    <UiPageHeader title="Receive stock" :crumbs="[{ label: 'Inventory', to: '/admin/inventory' }, { label: 'Receiving', to: '/admin/inventory/receiving' }, { label: 'New' }]" />
    <form class="space-y-5" novalidate @submit.prevent="submit">
      <UiCard title="Delivery">
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <UiField id="r-po" label="Purchase order" hint="Optional — prefills outstanding items">
            <select id="r-po" v-model="poId" class="field">
              <option value="">No purchase order</option>
              <option v-for="po in openPos?.items ?? []" :key="po.id" :value="po.id">{{ po.number }} · {{ po.supplier.name }}</option>
            </select>
          </UiField>
          <UiField id="r-supplier" label="Supplier">
            <select id="r-supplier" v-model="supplierId" class="field" :disabled="!!poId">
              <option value="">Not specified</option>
              <option v-for="s in suppliers?.items ?? []" :key="s.id" :value="s.id">{{ s.name }}</option>
            </select>
          </UiField>
          <UiField id="r-ref" label="Supplier invoice / delivery note"><input id="r-ref" v-model="reference" class="field" maxlength="80"></UiField>
          <UiField id="r-date" label="Date received"><input id="r-date" v-model="receivedAt" type="date" class="field" :max="today()"></UiField>
          <UiField id="r-notes" label="Notes" class="sm:col-span-2 lg:col-span-4"><input id="r-notes" v-model="notes" class="field" maxlength="2000"></UiField>
        </div>
      </UiCard>

      <UiCard title="Items" subtitle="Damaged units are recorded but never added to sellable stock.">
        <AdminVariantPicker v-if="!poId" class="mb-4" include-draft :show-stock="false" placeholder="Add a product: search or scan a barcode" @select="add" />
        <UiSkeleton v-if="loadingPo" :rows="3" />
        <UiEmpty v-else-if="!lines.length" title="No items yet" message="Choose a purchase order or add products above." />
        <div v-else class="overflow-x-auto">
          <table class="sg-table min-w-[880px]">
            <thead><tr><th>Item</th><th v-if="poId" class="text-right">Ordered / prev.</th><th>Received</th><th>Damaged</th><th>Accepted</th><th>Unit cost</th><th class="text-right">Line</th><th /></tr></thead>
            <tbody>
              <tr v-for="(l, i) in lines" :key="l.variantId">
                <td><span class="block font-medium">{{ l.label }}</span><span class="block font-mono text-xs text-ink-muted">{{ l.sku }}</span></td>
                <td v-if="poId" class="num text-right text-ink-soft">{{ l.ordered }} / {{ l.alreadyReceived }}</td>
                <td class="w-24"><label :for="`rq-${i}`" class="sr-only">Received</label><input :id="`rq-${i}`" v-model.number="l.receivedQty" type="number" min="0" class="field h-9" @input="sync(l)"></td>
                <td class="w-24"><label :for="`dq-${i}`" class="sr-only">Damaged</label><input :id="`dq-${i}`" v-model.number="l.damagedQty" type="number" min="0" class="field h-9" @input="sync(l)"></td>
                <td class="w-24"><label :for="`aq-${i}`" class="sr-only">Accepted</label><input :id="`aq-${i}`" v-model.number="l.acceptedQty" type="number" min="0" class="field h-9" :class="l.acceptedQty + l.damagedQty > l.receivedQty ? 'border-negative/60' : ''"></td>
                <td class="min-w-[150px]"><UiMoneyInput :id="`uc-${i}`" v-model="l.unitCost" nullable /></td>
                <td class="num text-right">{{ money((l.acceptedQty || 0) * (l.unitCost ?? 0)) }}</td>
                <td class="text-right"><UiIconButton :icon="Trash2" label="Remove line" size="sm" @click="lines.splice(i, 1)" /></td>
              </tr>
            </tbody>
          </table>
          <p class="mt-3 text-right text-sm">Accepted value <b class="num">{{ money(total) }}</b></p>
        </div>
      </UiCard>

      <div class="flex flex-wrap items-center justify-end gap-3">
        <p v-if="error" class="mr-auto text-sm font-medium text-negative" role="alert">{{ error }}</p>
        <UiButton variant="light" to="/admin/inventory/receiving">Cancel</UiButton>
        <UiButton type="submit" :loading="pending" :disabled="!lines.length">Record delivery</UiButton>
      </div>
    </form>
  </div>
</template>
