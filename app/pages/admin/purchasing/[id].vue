<script setup lang="ts">
import { PackageCheck, Send, XCircle } from 'lucide-vue-next'
import type { PoFormValue } from '~/components/purchasing/PurchaseOrderForm.vue'

definePageMeta({ layout: 'admin' })

const route = useRoute()
const id = computed(() => String(route.params.id))
const { can } = useStaff()
const { money, date } = useFormat()
const { confirm } = useConfirm()
const { pending, run } = useAction()

const { data: po, error, status, refresh } = useFetch(() => `/api/admin/purchase-orders/${id.value}`, { server: false })
useHead({ title: () => po.value?.number ?? 'Purchase order' })

const editing = ref(false)
const initial = computed<PoFormValue | undefined>(() => po.value
  ? {
      supplierId: po.value.supplierId,
      expectedAt: po.value.expectedAt ? String(po.value.expectedAt).slice(0, 10) : '',
      notes: po.value.notes ?? '',
      items: po.value.items.map(i => ({ variantId: i.variantId, label: i.variant ? `${i.variant.product.name} · ${i.variant.title}` : i.variantId, sku: i.variant?.sku ?? '', orderedQty: i.orderedQty, unitCost: i.unitCost })),
    }
  : undefined)

const totals = computed(() => ({
  ordered: po.value?.items.reduce((s, i) => s + i.orderedQty, 0) ?? 0,
  received: po.value?.items.reduce((s, i) => s + i.receivedQty, 0) ?? 0,
  value: po.value?.items.reduce((s, i) => s + i.orderedQty * i.unitCost, 0) ?? 0,
}))

async function save(payload: Record<string, unknown>) {
  const ok = await run(() => apiFetch(`/api/admin/purchase-orders/${id.value}`, { method: 'PUT', body: payload }), { success: 'Purchase order updated' })
  if (ok) {
    editing.value = false
    await refresh()
  }
}

async function setStatus(to: 'ORDERED' | 'RECEIVED' | 'CANCELLED') {
  const copy = {
    ORDERED: { title: 'Mark as ordered?', message: 'The order is locked for editing and can be received against.', confirmLabel: 'Mark as ordered', danger: false },
    RECEIVED: { title: 'Close this purchase order short?', message: 'Remaining quantities will be treated as not arriving. Stock already received is unaffected.', confirmLabel: 'Close purchase order', danger: false },
    CANCELLED: { title: 'Cancel this purchase order?', message: 'This cannot be undone. No stock will change.', confirmLabel: 'Cancel purchase order', danger: true },
  }[to]
  if (!(await confirm(copy))) return
  const ok = await run(() => apiFetch(`/api/admin/purchase-orders/${id.value}/status`, { method: 'POST', body: { status: to } }), { success: 'Purchase order updated' })
  if (ok) await refresh()
}
</script>

<template>
  <div>
    <UiErrorState v-if="error" :error="error" @retry="refresh()" />
    <UiSkeleton v-else-if="status === 'pending' && !po" :rows="6" />
    <template v-else-if="po">
      <UiPageHeader :title="po.number" :subtitle="`${po.supplier.name}${po.expectedAt ? ` · expected ${date(po.expectedAt, false)}` : ''}`" :crumbs="[{ label: 'Purchasing', to: '/admin/purchasing' }, { label: po.number }]">
        <UiStatusBadge kind="po" :value="po.status" />
        <template v-if="can('purchasing.manage')">
          <UiButton v-if="po.status === 'DRAFT' && !editing" variant="light" @click="editing = true">Edit</UiButton>
          <UiButton v-if="po.status === 'DRAFT'" :icon="Send" :loading="pending" @click="setStatus('ORDERED')">Mark as ordered</UiButton>
          <UiButton v-if="po.status === 'PARTIALLY_RECEIVED'" variant="light" :loading="pending" @click="setStatus('RECEIVED')">Close short</UiButton>
          <UiButton v-if="po.status === 'DRAFT' || po.status === 'ORDERED'" variant="ghost" :icon="XCircle" @click="setStatus('CANCELLED')">Cancel</UiButton>
        </template>
        <UiButton v-if="can('inventory.receive') && (po.status === 'ORDERED' || po.status === 'PARTIALLY_RECEIVED')" :to="`/admin/inventory/receiving/new?po=${po.id}`" variant="accent" :icon="PackageCheck">Receive stock</UiButton>
      </UiPageHeader>

      <PurchasingPurchaseOrderForm v-if="editing && initial" :initial="initial" submit-label="Save changes" :pending="pending" @submit="save" />

      <div v-else class="space-y-5">
        <div class="grid gap-4 sm:grid-cols-3">
          <div class="accent-card p-5"><p class="text-[13px] text-white/90">Order value</p><p class="num mt-3 text-2xl font-semibold">{{ money(totals.value) }}</p></div>
          <div class="glass-card p-5"><p class="text-[13px] text-ink-soft">Units received</p><p class="num mt-3 text-2xl font-semibold">{{ totals.received }} <span class="text-base font-normal text-ink-muted">/ {{ totals.ordered }}</span></p></div>
          <div class="glass-card p-5"><p class="text-[13px] text-ink-soft">Supplier</p><p class="mt-3 font-semibold">{{ po.supplier.name }}</p><p class="text-xs text-ink-muted">{{ [po.supplier.contactPerson, po.supplier.phone, po.supplier.email].filter(Boolean).join(' · ') || 'No contact details' }}</p></div>
        </div>

        <UiCard title="Items">
          <div class="overflow-x-auto">
            <table class="sg-table min-w-[680px]">
              <thead><tr><th>Item</th><th class="text-right">Unit cost</th><th class="text-right">Ordered</th><th class="w-56">Received</th><th class="text-right">Line value</th></tr></thead>
              <tbody>
                <tr v-for="i in po.items" :key="i.id">
                  <td><p class="font-medium">{{ i.variant?.product.name }} <span class="font-normal text-ink-muted">· {{ i.variant?.title }}</span></p><p class="text-xs text-ink-muted">{{ i.variant?.sku }}</p></td>
                  <td class="num text-right">{{ money(i.unitCost) }}</td>
                  <td class="num text-right">{{ i.orderedQty }}</td>
                  <td>
                    <div class="flex items-center gap-2">
                      <div class="h-2 flex-1 overflow-hidden rounded-full bg-sand-50" role="progressbar" :aria-valuenow="i.receivedQty" aria-valuemin="0" :aria-valuemax="i.orderedQty" :aria-label="`Received ${i.receivedQty} of ${i.orderedQty}`">
                        <div class="h-full rounded-full" :class="i.receivedQty >= i.orderedQty ? 'bg-positive' : 'bg-accent'" :style="{ width: `${Math.min(100, (i.receivedQty / i.orderedQty) * 100)}%` }" />
                      </div>
                      <span class="num text-xs">{{ i.receivedQty }}/{{ i.orderedQty }}</span>
                    </div>
                  </td>
                  <td class="num text-right">{{ money(i.orderedQty * i.unitCost) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-if="po.notes" class="mt-3 text-sm text-ink-soft"><span class="font-medium">Notes:</span> {{ po.notes }}</p>
        </UiCard>

        <UiCard title="Goods receipts" subtitle="Deliveries recorded against this purchase order">
          <UiEmpty v-if="!po.receipts.length" title="Nothing received yet" message="Receipts appear here once stock is received against this order." />
          <div v-else class="overflow-x-auto">
            <table class="sg-table min-w-[560px]">
              <thead><tr><th>Receipt</th><th>Received</th><th>Reference</th><th class="text-right">Accepted</th><th class="text-right">Damaged</th></tr></thead>
              <tbody>
                <tr v-for="r in po.receipts" :key="r.id">
                  <td class="font-medium">{{ r.number }}</td>
                  <td class="text-ink-soft">{{ date(r.receivedAt) }}</td>
                  <td>{{ r.reference ?? '—' }}</td>
                  <td class="num text-right">{{ r.items.reduce((s, x) => s + x.acceptedQty, 0) }}</td>
                  <td class="num text-right">{{ r.items.reduce((s, x) => s + x.damagedQty, 0) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </UiCard>
      </div>
    </template>
  </div>
</template>
