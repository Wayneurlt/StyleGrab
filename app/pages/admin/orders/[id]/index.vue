<script setup lang="ts">
import { Ban, CheckCircle2, CreditCard, Printer, RotateCcw, Undo2, XCircle } from 'lucide-vue-next'
import { CHANNEL_LABELS, CONDITION_LABELS, ORDER_STATUS, ORDER_TRANSITIONS } from '#shared/labels'
import type { MethodOption } from '~/components/sales/PaymentRows.vue'

definePageMeta({ layout: 'admin' })

const route = useRoute()
const id = computed(() => String(route.params.id))
const { money, date } = useFormat()
const { can } = useStaff()
const { confirm } = useConfirm()
const { data: order, status, error, refresh } = useFetch(() => `/api/admin/orders/${id.value}`, { server: false })
useHead({ title: () => order.value?.number ?? 'Order' })

const { data: methodsData } = useFetch('/api/admin/payment-methods', { server: false })
const methods = computed<MethodOption[]>(() => methodsData.value ?? [])
const users = computed<Record<string, string>>(() => order.value?.users ?? {})
const itemName = (orderItemId: string) => {
  const i = order.value?.items.find(x => x.id === orderItemId)
  return i ? `${i.productName} · ${i.variantTitle}` : 'Item'
}

// ---- Fulfilment transitions -------------------------------------------------
const transitions = computed(() => (order.value ? ORDER_TRANSITIONS[order.value.status] ?? [] : []).filter(t => can(t === 'CANCELLED' ? 'orders.cancel' : 'orders.manage')))
const { pending: moving, run } = useAction()
async function transition(to: string) {
  const o = order.value!
  let note: string | null = null
  if (to === 'CANCELLED') {
    const r = await confirm({ title: `Cancel ${o.number}?`, message: 'Reserved stock is released. Orders with recorded payments must have them voided, rejected or refunded first.', confirmLabel: 'Cancel order', danger: true, requireReason: 'Reason for cancelling' })
    if (!r) return
    note = String(r)
  }
  else if (to === 'COMPLETED') {
    const ok = await confirm({ title: `Mark ${o.number} completed?`, message: `Completing hands the goods over: reserved stock is deducted from inventory now. Payment status is not changed${order.value!.balance > 0 ? ` — ${money(order.value!.balance)} will remain outstanding` : ''}.`, confirmLabel: 'Complete order' })
    if (!ok) return
  }
  const res = await run(() => apiFetch(`/api/admin/orders/${o.id}/status`, { method: 'POST', body: { status: to, note } }), { success: `Order ${ORDER_STATUS[to]?.label.toLowerCase()}` })
  if (res) refresh()
}

// ---- Payments ----------------------------------------------------------------
const payOpen = ref(false)
const { run: runPay } = useAction()
async function verify(p: { id: string, amount: number, reference: string | null, method: { name: string } }, approve: boolean) {
  const r = approve
    ? await confirm({ title: 'Confirm payment received?', message: `Only confirm after checking the ${p.method.name} statement shows ${money(p.amount)}${p.reference ? ` with reference ${p.reference}` : ''}.`, confirmLabel: 'Confirm received' })
    : await confirm({ title: 'Reject this payment?', message: 'Use this when the payment cannot be found on the statement.', confirmLabel: 'Reject', danger: true, requireReason: 'Why was it rejected?' })
  if (!r) return
  const res = await runPay(() => apiFetch(`/api/admin/payments/${p.id}/verify`, { method: 'POST', body: { approve, note: typeof r === 'string' ? r : null } }), { success: approve ? 'Payment confirmed' : 'Payment rejected' })
  if (res) refresh()
}
async function voidPayment(p: { id: string, amount: number }) {
  const r = await confirm({ title: 'Void this payment record?', message: `Voiding removes ${money(p.amount)} from the amount paid. Use it only for entries made in error — money returned to a customer is a refund.`, confirmLabel: 'Void', danger: true, requireReason: 'Reason for voiding' })
  if (!r) return
  const res = await runPay(() => apiFetch(`/api/admin/payments/${p.id}/void`, { method: 'POST', body: { reason: String(r) } }), { success: 'Payment voided' })
  if (res) refresh()
}

// ---- Returns -----------------------------------------------------------------
const returnOpen = ref(false)
async function inspect(itemId: string, saleable: boolean) {
  const ok = await confirm({ title: saleable ? 'Restock this item?' : 'Write this item off?', message: saleable ? 'It goes back into sellable stock.' : 'It stays out of sellable stock permanently.', confirmLabel: saleable ? 'Restock' : 'Write off', danger: !saleable })
  if (!ok) return
  const res = await runPay(() => apiFetch(`/api/admin/returns/items/${itemId}/inspect`, { method: 'POST', body: { saleable } }), { success: saleable ? 'Restocked' : 'Written off' })
  if (res) refresh()
}

// ---- Notes & assignment ----------------------------------------------------
const { data: staff } = useFetch('/api/admin/users', { server: false })
const noteDraft = ref('')
const assignee = ref('')
watch(order, (o) => {
  noteDraft.value = o?.internalNote ?? ''
  assignee.value = o?.assignedToId ?? ''
}, { immediate: true })
const { pending: saving, run: runSave } = useAction()
async function saveNotes() {
  const r = await runSave(() => apiFetch(`/api/admin/orders/${id.value}`, { method: 'PATCH', body: { internalNote: noteDraft.value.trim() || null, assignedToId: assignee.value || null } }), { success: 'Saved' })
  if (r) refresh()
}
</script>

<template>
  <div>
    <UiErrorState v-if="error" :error="error" @retry="refresh()" />
    <UiSkeleton v-else-if="status === 'pending' && !order" :rows="4" height="h-32" />
    <template v-else-if="order">
      <UiPageHeader :title="order.number" :subtitle="`${CHANNEL_LABELS[order.channel]} · placed ${date(order.placedAt)}`" :crumbs="[{ label: 'Orders', to: '/admin/orders' }, { label: order.number }]">
        <UiButton :to="`/admin/orders/${order.id}/receipt`" variant="light" :icon="Printer">Receipt</UiButton>
        <UiButton v-if="order.status === 'COMPLETED' && can('returns.create')" variant="light" :icon="Undo2" @click="returnOpen = true">Process return</UiButton>
        <template v-for="t in transitions" :key="t">
          <UiButton :variant="t === 'CANCELLED' ? 'light' : 'dark'" :icon="t === 'CANCELLED' ? Ban : CheckCircle2" :loading="moving" @click="transition(t)">
            {{ t === 'CANCELLED' ? 'Cancel order' : `Mark ${ORDER_STATUS[t]?.label.toLowerCase()}` }}
          </UiButton>
        </template>
      </UiPageHeader>

      <p v-if="order.exchangedFrom" class="glass-inner mb-5 px-4 py-3 text-sm">
        Replacement sale for return {{ order.exchangedFrom.number }} on order
        <NuxtLink :to="`/admin/orders/${order.exchangedFrom.order.id}`" class="font-medium underline">{{ order.exchangedFrom.order.number }}</NuxtLink>
      </p>
      <div class="grid grid-cols-1 gap-5 xl:grid-cols-[1.6fr_1fr]">
        <div class="min-w-0 space-y-5">
          <UiCard title="Items" subtitle="Prices and names as recorded at the time of sale">
            <div class="overflow-x-auto">
              <table class="sg-table min-w-[620px]">
                <thead><tr><th>Item</th><th class="text-right">Qty</th><th class="text-right">Unit</th><th class="text-right">Discount</th><th class="text-right">Total</th></tr></thead>
                <tbody>
                  <tr v-for="i in order.items" :key="i.id">
                    <td>
                      <span class="font-medium">{{ i.productName }}</span>
                      <span class="block text-xs text-ink-muted">{{ i.variantTitle }} · {{ i.sku }}</span>
                      <UiBadge v-if="i.returnedQty" tone="info" class="mt-1">{{ i.returnedQty }} returned</UiBadge>
                    </td>
                    <td class="num text-right">{{ i.quantity }}</td>
                    <td class="num text-right">{{ money(i.unitPrice) }}<span v-if="i.unitPrice !== i.listPrice" class="block text-[11px] text-ink-muted line-through">{{ money(i.listPrice) }}</span></td>
                    <td class="num text-right">{{ i.lineDiscount + i.orderDiscountShare ? `− ${money(i.lineDiscount + i.orderDiscountShare)}` : '—' }}</td>
                    <td class="num text-right font-medium">{{ money(i.lineTotal) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <dl class="ml-auto mt-4 max-w-xs space-y-1.5 text-sm">
              <div class="flex justify-between"><dt class="text-ink-soft">Subtotal</dt><dd class="num">{{ money(order.subtotal) }}</dd></div>
              <div v-if="order.discountTotal" class="flex justify-between"><dt class="text-ink-soft">Discounts</dt><dd class="num">− {{ money(order.discountTotal) }}</dd></div>
              <div class="flex justify-between font-semibold"><dt>Total</dt><dd class="num">{{ money(order.total) }}</dd></div>
              <div v-if="order.amountReturned" class="flex justify-between"><dt class="text-ink-soft">Returned goods</dt><dd class="num">− {{ money(order.amountReturned) }}</dd></div>
              <div class="flex justify-between"><dt class="text-ink-soft">Paid (confirmed)</dt><dd class="num">{{ money(order.amountPaid) }}</dd></div>
              <div v-if="order.amountPending" class="flex justify-between text-caution"><dt>Awaiting confirmation</dt><dd class="num">{{ money(order.amountPending) }}</dd></div>
              <div v-if="order.amountRefunded" class="flex justify-between"><dt class="text-ink-soft">Refunded</dt><dd class="num">− {{ money(order.amountRefunded) }}</dd></div>
              <div class="flex justify-between border-t border-sand-200 pt-1.5 font-semibold" :class="order.balance > 0 ? 'text-negative' : ''"><dt>Balance due</dt><dd class="num">{{ money(order.balance) }}</dd></div>
            </dl>
          </UiCard>

          <UiCard title="Payments" subtitle="Records of money received outside StyleGrab">
            <template #actions>
              <UiButton v-if="can('payments.record') && order.status !== 'CANCELLED' && order.balance - order.amountPending > 0" size="sm" :icon="CreditCard" @click="payOpen = true">Record payment</UiButton>
            </template>
            <UiEmpty v-if="!order.payments.length && !order.refunds.length" title="No payments recorded" />
            <div v-else class="overflow-x-auto">
              <table class="sg-table min-w-[640px]">
                <thead><tr><th>Received</th><th>Method</th><th>Reference</th><th class="text-right">Amount</th><th>Status</th><th><span class="sr-only">Actions</span></th></tr></thead>
                <tbody>
                  <tr v-for="p in order.payments" :key="p.id">
                    <td class="whitespace-nowrap">{{ date(p.receivedAt) }}<span class="block text-xs text-ink-muted">by {{ users[p.recordedById ?? ''] ?? '—' }}</span></td>
                    <td>{{ p.method.name }}</td>
                    <td class="font-mono text-xs">{{ p.reference ?? '—' }}</td>
                    <td class="num text-right">{{ money(p.amount) }}<span v-if="p.tendered && p.tendered > p.amount" class="block text-[11px] text-ink-muted">tendered {{ money(p.tendered) }}</span></td>
                    <td>
                      <UiStatusBadge kind="record" :value="p.status" />
                      <span v-if="p.verifiedById && p.status !== 'PENDING_CONFIRMATION'" class="block text-[11px] text-ink-muted">{{ users[p.verifiedById] ?? '' }}<template v-if="p.verificationNote"> · {{ p.verificationNote }}</template></span>
                    </td>
                    <td class="whitespace-nowrap text-right">
                      <template v-if="p.status === 'PENDING_CONFIRMATION' && can('payments.verify')">
                        <UiIconButton :icon="CheckCircle2" label="Confirm payment received" size="sm" @click="verify(p, true)" />
                        <UiIconButton :icon="XCircle" label="Reject payment" size="sm" @click="verify(p, false)" />
                      </template>
                      <UiIconButton v-if="(p.status === 'PENDING_CONFIRMATION' || p.status === 'CONFIRMED') && can('payments.void')" :icon="Ban" label="Void payment record" size="sm" @click="voidPayment(p)" />
                    </td>
                  </tr>
                  <tr v-for="r in order.refunds" :key="r.id">
                    <td class="whitespace-nowrap">{{ date(r.createdAt) }}<span class="block text-xs text-ink-muted">by {{ users[r.recordedById] ?? '—' }}</span></td>
                    <td>{{ r.method.name }} <UiBadge tone="info">{{ r.method.type === 'EXCHANGE_CREDIT' ? 'Exchange credit' : 'Refund' }}</UiBadge></td>
                    <td class="font-mono text-xs">{{ r.reference ?? '—' }}</td>
                    <td class="num text-right text-negative">− {{ money(r.amount) }}</td>
                    <td class="text-xs text-ink-muted">{{ r.notes }}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          </UiCard>

          <UiCard v-if="order.returns.length" title="Returns">
            <ul class="space-y-3">
              <li v-for="r in order.returns" :key="r.id" class="rounded-2xl bg-sand-50 p-4">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <p class="font-medium">{{ r.number }} <span class="font-normal text-ink-muted">· {{ date(r.createdAt) }} · {{ r.resolution === 'NO_REFUND' ? 'No refund' : r.resolution.toLowerCase() }}</span></p>
                  <span class="num text-sm">Credit {{ money(r.creditAmount) }}</span>
                </div>
                <p class="mt-1 text-sm text-ink-soft">Reason: {{ r.reason }}</p>
                <p v-if="order.exchangeOrders[r.id]" class="mt-1 text-sm">Replacement sale: <NuxtLink :to="`/admin/orders/${order.exchangeOrders[r.id]!.id}`" class="font-medium underline">{{ order.exchangeOrders[r.id]!.number }}</NuxtLink></p>
                <ul class="mt-2 space-y-1.5">
                  <li v-for="ri in r.items" :key="ri.id" class="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span>{{ ri.quantity }} × {{ itemName(ri.orderItemId) }} — <span class="text-ink-muted">{{ CONDITION_LABELS[ri.condition] }}</span></span>
                    <span v-if="ri.condition === 'NEEDS_INSPECTION' && !ri.resolvedAt && can('returns.create')" class="flex gap-2">
                      <UiButton size="sm" variant="light" :icon="RotateCcw" @click="inspect(ri.id, true)">Restock</UiButton>
                      <UiButton size="sm" variant="light" @click="inspect(ri.id, false)">Write off</UiButton>
                    </span>
                    <UiBadge v-else-if="ri.condition === 'NEEDS_INSPECTION'" :tone="ri.restocked ? 'success' : 'neutral'">{{ ri.restocked ? 'Restocked' : 'Written off' }}</UiBadge>
                    <UiBadge v-else :tone="ri.restocked ? 'success' : 'neutral'">{{ ri.restocked ? 'Restocked' : 'Not restocked' }}</UiBadge>
                  </li>
                </ul>
              </li>
            </ul>
          </UiCard>
        </div>

        <div class="space-y-5">
          <UiCard title="Status">
            <dl class="space-y-3 text-sm">
              <div class="flex items-center justify-between"><dt class="text-ink-soft">Fulfilment</dt><dd><UiStatusBadge kind="order" :value="order.status" /></dd></div>
              <div class="flex items-center justify-between"><dt class="text-ink-soft">Payment</dt><dd><UiStatusBadge kind="payment" :value="order.paymentStatus" /></dd></div>
              <div class="flex justify-between"><dt class="text-ink-soft">Channel</dt><dd>{{ CHANNEL_LABELS[order.channel] }}</dd></div>
              <div class="flex justify-between"><dt class="text-ink-soft">Fulfilment type</dt><dd>{{ { IN_STORE: 'In store', PICKUP: 'Pickup', DELIVERY: 'Delivery' }[order.fulfilmentType] }}</dd></div>
              <div v-if="order.shift" class="flex justify-between"><dt class="text-ink-soft">Register</dt><dd><NuxtLink :to="`/admin/pos/shifts/${order.shift.id}`" class="hover:underline">{{ order.shift.register.name }}</NuxtLink></dd></div>
              <div v-if="order.createdById" class="flex justify-between"><dt class="text-ink-soft">Recorded by</dt><dd>{{ users[order.createdById] ?? '—' }}</dd></div>
              <div v-if="order.reservationExpiresAt && order.status === 'PENDING'" class="rounded-xl bg-caution-tint px-3 py-2 text-xs text-caution">Stock reservation expires {{ date(order.reservationExpiresAt) }} unless the order is confirmed or a payment is recorded.</div>
              <div v-if="order.cancelReason" class="rounded-xl bg-negative-tint px-3 py-2 text-xs text-negative">Cancelled: {{ order.cancelReason }}</div>
            </dl>
          </UiCard>

          <UiCard title="Customer">
            <div class="space-y-1 text-sm">
              <NuxtLink v-if="order.customer" :to="`/admin/customers/${order.customer.id}`" class="font-medium hover:underline">{{ order.customer.name }}</NuxtLink>
              <p v-else class="font-medium">{{ order.contactName ?? 'Walk-in customer' }}</p>
              <p v-if="order.contactPhone || order.customer?.phone" class="text-ink-soft">{{ order.contactPhone ?? order.customer?.phone }}</p>
              <p v-if="order.contactEmail || order.customer?.email" class="text-ink-soft">{{ order.contactEmail ?? order.customer?.email }}</p>
              <p v-if="order.shippingAddress" class="whitespace-pre-line pt-2 text-ink-soft">{{ order.shippingAddress }}</p>
              <p v-if="order.customerNote" class="mt-2 rounded-xl bg-sand-50 p-2 text-ink-soft">“{{ order.customerNote }}”</p>
            </div>
          </UiCard>

          <UiCard title="Internal">
            <div class="space-y-3">
              <UiField id="assign" label="Assigned to">
                <select id="assign" v-model="assignee" class="field" :disabled="!can('orders.manage')">
                  <option value="">Unassigned</option>
                  <option v-for="u in staff ?? []" :key="u.id" :value="u.id">{{ u.name }}</option>
                </select>
              </UiField>
              <UiField id="inote" label="Internal note"><textarea id="inote" v-model="noteDraft" rows="3" class="field" maxlength="2000" :disabled="!can('orders.manage')" /></UiField>
              <UiButton v-if="can('orders.manage')" size="sm" :loading="saving" :disabled="noteDraft === (order.internalNote ?? '') && assignee === (order.assignedToId ?? '')" @click="saveNotes">Save</UiButton>
            </div>
          </UiCard>

          <UiCard title="History">
            <ol class="relative space-y-4 border-l border-sand-200 pl-4">
              <li v-for="h in order.statusHistory" :key="h.id" class="relative">
                <span class="absolute -left-[21px] top-1 size-2.5 rounded-full bg-ink ring-4 ring-white/60" aria-hidden="true" />
                <p class="text-sm font-medium">{{ ORDER_STATUS[h.toStatus]?.label }}</p>
                <p class="text-xs text-ink-muted">{{ date(h.createdAt) }}<template v-if="h.userId"> · {{ users[h.userId] ?? 'staff' }}</template></p>
                <p v-if="h.note" class="text-xs text-ink-soft">{{ h.note }}</p>
              </li>
            </ol>
          </UiCard>
        </div>
      </div>

      <SalesPaymentDialog v-model:open="payOpen" :order-id="order.id" :order-number="order.number" :balance="Math.max(0, order.balance - order.amountPending)" :methods="methods" @recorded="refresh()" />
      <SalesReturnDialog v-if="order.status === 'COMPLETED'" v-model:open="returnOpen" :order="order" :methods="methods" @done="refresh()" />
    </template>
  </div>
</template>
