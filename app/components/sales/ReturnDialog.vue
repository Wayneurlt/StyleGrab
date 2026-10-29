<script setup lang="ts">
import { divRound } from '#shared/money'
import { CONDITION_LABELS } from '#shared/labels'
import type { PickedVariant } from '~/components/admin/VariantPicker.vue'
import { addVariant, previewTotals, toLinePayload, type EditLine } from './CartLines.vue'
import type { MethodOption, PaymentPayload } from './PaymentRows.vue'

interface ReturnableOrder {
  id: string
  number: string
  total: number
  amountPaid: number
  amountRefunded: number
  amountReturned: number
  items: { id: string, productName: string, variantTitle: string, sku: string, quantity: number, returnedQty: number, lineTotal: number }[]
}

/** Return / exchange against a completed order. Credit and refund limits are previewed; the server enforces them. */
const open = defineModel<boolean>('open', { required: true })
const props = defineProps<{ order: ReturnableOrder, methods: MethodOption[] }>()
const emit = defineEmits<{ done: [] }>()
const { money } = useFormat()
const { can, canAny } = useStaff()

type Condition = 'SALEABLE' | 'DAMAGED' | 'NEEDS_INSPECTION'
const rows = ref<{ orderItemId: string, quantity: number, condition: Condition }[]>([])
const reason = ref('')
const notes = ref('')
const resolution = ref<'REFUND' | 'EXCHANGE' | 'NO_REFUND'>('REFUND')
const refund = reactive({ methodId: '', amount: 0 as number | null, reference: '' })
const exchangeLines = ref<EditLine[]>([])
const exchangePayments = ref<PaymentPayload[]>([])
const key = ref(newKey())
const shiftId = ref<string | null>(null)
const usable = computed(() => props.methods.filter(m => m.isActive && m.type !== 'EXCHANGE_CREDIT'))

watch(open, async (v) => {
  if (!v) return
  key.value = newKey()
  rows.value = props.order.items.filter(i => i.quantity > i.returnedQty).map(i => ({ orderItemId: i.id, quantity: 0, condition: 'SALEABLE' as Condition }))
  reason.value = ''
  notes.value = ''
  resolution.value = 'REFUND'
  exchangeLines.value = []
  exchangePayments.value = []
  Object.assign(refund, { methodId: usable.value[0]?.id ?? '', amount: 0, reference: '' })
  shiftId.value = null
  if (canAny('pos.sell', 'shifts.manage')) {
    const s = await apiFetch<{ shift: { id: string } } | null>('/api/admin/shifts/current').catch(() => null)
    shiftId.value = s?.shift.id ?? null
  }
})

const item = (id: string) => props.order.items.find(i => i.id === id)!
const credit = computed(() => rows.value.reduce((s, r) => {
  if (!r.quantity) return s
  const i = item(r.orderItemId)
  return s + divRound(i.lineTotal * (i.returnedQty + r.quantity), i.quantity) - divRound(i.lineTotal * i.returnedQty, i.quantity)
}, 0))
// Money paid beyond what will still be owed after this return.
const refundable = computed(() => Math.min(credit.value, Math.max(0, (props.order.amountPaid - props.order.amountRefunded) - (props.order.total - props.order.amountReturned - credit.value))))
const exchangeTotal = computed(() => previewTotals(exchangeLines.value, null).total)
const creditApplied = computed(() => (resolution.value === 'EXCHANGE' ? Math.min(refundable.value, exchangeTotal.value) : 0))
const refundMax = computed(() => (resolution.value === 'NO_REFUND' ? 0 : refundable.value - creditApplied.value))
const exchangeDue = computed(() => Math.max(0, exchangeTotal.value - creditApplied.value))

watch([refundMax, resolution], () => {
  refund.amount = resolution.value === 'REFUND' ? refundMax.value : 0
})

const refundMethod = computed(() => usable.value.find(m => m.id === refund.methodId))
const hasItems = computed(() => rows.value.some(r => r.quantity > 0))
const valid = computed(() =>
  hasItems.value
  && reason.value.trim().length >= 2
  && (refund.amount ?? 0) <= refundMax.value
  && (resolution.value !== 'EXCHANGE' || exchangeLines.value.length > 0)
  && (!(refund.amount ?? 0) || !refundMethod.value?.requiresReference || !!refund.reference.trim()),
)

function addReplacement(v: PickedVariant) {
  addVariant(exchangeLines.value, v)
}

const { pending, run } = useAction()
async function submit() {
  if (!valid.value) return
  const refundAmount = refund.amount ?? 0
  const r = await run(() => apiFetch('/api/admin/returns', {
    method: 'POST',
    body: {
      orderId: props.order.id,
      idempotencyKey: key.value,
      reason: reason.value.trim(),
      notes: notes.value.trim() || null,
      resolution: resolution.value,
      items: rows.value.filter(x => x.quantity > 0),
      refund: refundAmount > 0 ? { methodId: refund.methodId, amount: refundAmount, reference: refund.reference.trim() || null } : null,
      exchange: resolution.value === 'EXCHANGE' ? { lines: toLinePayload(exchangeLines.value), payments: exchangePayments.value } : null,
      shiftId: shiftId.value,
    },
  }), { success: resolution.value === 'EXCHANGE' ? 'Exchange recorded — the replacement sale was created' : 'Return recorded' })
  if (r) {
    open.value = false
    emit('done')
  }
}
</script>

<template>
  <UiModal v-model:open="open" :title="`Return items · ${order.number}`" description="The original sale is kept; only returned quantities and amounts are recorded." size="xl">
    <div class="space-y-5">
      <section>
        <h3 class="mb-2 text-sm font-medium">Items being returned</h3>
        <div class="overflow-x-auto">
          <table class="sg-table min-w-[620px]">
            <thead><tr><th>Item</th><th>Returnable</th><th>Quantity</th><th>Condition</th></tr></thead>
            <tbody>
              <tr v-for="r in rows" :key="r.orderItemId">
                <td><span class="font-medium">{{ item(r.orderItemId).productName }}</span><span class="block text-xs text-ink-muted">{{ item(r.orderItemId).variantTitle }} · {{ item(r.orderItemId).sku }}</span></td>
                <td class="num">{{ item(r.orderItemId).quantity - item(r.orderItemId).returnedQty }}</td>
                <td><input v-model.number="r.quantity" type="number" min="0" :max="item(r.orderItemId).quantity - item(r.orderItemId).returnedQty" class="field num h-9 w-20" :aria-label="`Quantity to return of ${item(r.orderItemId).productName}`"></td>
                <td>
                  <select v-model="r.condition" class="field h-9" :aria-label="`Condition of ${item(r.orderItemId).productName}`">
                    <option v-for="(label, k) in CONDITION_LABELS" :key="k" :value="k">{{ label }}</option>
                  </select>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="!rows.length" class="text-sm text-ink-muted">Everything on this order has already been returned.</p>
        <p v-if="rows.some(r => r.quantity > item(r.orderItemId).quantity - item(r.orderItemId).returnedQty)" class="mt-2 text-xs font-medium text-negative">A quantity exceeds what can still be returned.</p>
        <p class="mt-2 text-xs text-ink-muted">Only “saleable” items go back into sellable stock. “Needs inspection” items can be restocked or written off later.</p>
      </section>

      <div class="grid gap-3 sm:grid-cols-2">
        <UiField id="rt-reason" label="Reason" required><input id="rt-reason" v-model="reason" class="field" maxlength="500" placeholder="e.g. Wrong size"></UiField>
        <UiField id="rt-notes" label="Notes"><input id="rt-notes" v-model="notes" class="field" maxlength="1000"></UiField>
      </div>

      <section>
        <UiTabs v-model="resolution" :tabs="[{ value: 'REFUND', label: 'Refund' }, { value: 'EXCHANGE', label: 'Exchange' }, { value: 'NO_REFUND', label: 'No refund' }]" label="Resolution" />
        <div class="mt-3 rounded-2xl bg-sand-50 p-3 text-sm">
          <p>Value of returned goods: <b class="num">{{ money(credit) }}</b></p>
          <p class="text-ink-muted">Refundable (paid beyond what is still owed): <b class="num text-ink">{{ money(refundable) }}</b></p>
          <p v-if="hasItems && refundable < credit" class="mt-1 text-xs text-caution">The customer has not paid for all of these goods; the remaining value reduces their balance instead.</p>
        </div>
      </section>

      <section v-if="resolution === 'EXCHANGE'" class="space-y-3">
        <h3 class="text-sm font-medium">Replacement items</h3>
        <AdminVariantPicker @select="addReplacement" />
        <SalesCartLines v-model="exchangeLines" :allow-discount="can('pos.discount')" :allow-override="can('pos.price.override')" compact />
        <div v-if="exchangeLines.length" class="rounded-2xl bg-sand-50 p-3 text-sm">
          <p>Replacement total <b class="num">{{ money(exchangeTotal) }}</b> · credit applied <b class="num">{{ money(creditApplied) }}</b></p>
          <p v-if="exchangeDue > 0" class="font-medium">Customer pays the difference: <span class="num">{{ money(exchangeDue) }}</span></p>
        </div>
        <SalesPaymentRows v-if="exchangeDue > 0" v-model:payments="exchangePayments" :methods="methods" :due="exchangeDue" />
      </section>

      <section v-if="resolution !== 'NO_REFUND' && refundMax > 0" class="grid gap-3 sm:grid-cols-3">
        <UiField id="rf-method" label="Refund method">
          <select id="rf-method" v-model="refund.methodId" class="field">
            <option v-for="m in usable" :key="m.id" :value="m.id">{{ m.name }}</option>
          </select>
        </UiField>
        <UiField id="rf-amount" :label="resolution === 'EXCHANGE' ? 'Refund leftover credit' : 'Refund amount'" :hint="`Up to ${money(refundMax)}`" :error="(refund.amount ?? 0) > refundMax ? 'Exceeds the refundable amount' : null">
          <UiMoneyInput id="rf-amount" v-model="refund.amount" />
        </UiField>
        <UiField id="rf-ref" label="Reference" :required="refundMethod?.requiresReference && !!refund.amount"><input id="rf-ref" v-model="refund.reference" class="field uppercase" maxlength="60"></UiField>
        <p v-if="refundMethod?.type === 'CASH' && !shiftId && refund.amount" class="text-xs text-caution sm:col-span-3">Cash refunds need an open cash shift of yours.</p>
      </section>
    </div>
    <template #footer>
      <UiButton variant="light" @click="open = false">Cancel</UiButton>
      <UiButton :loading="pending" :disabled="!valid" @click="submit">{{ resolution === 'EXCHANGE' ? 'Record exchange' : 'Record return' }}</UiButton>
    </template>
  </UiModal>
</template>
