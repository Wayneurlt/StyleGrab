<script setup lang="ts">
import { MANUAL_CHANNELS, CHANNEL_LABELS } from '#shared/labels'
import type { PickedVariant } from '~/components/admin/VariantPicker.vue'
import { addVariant, discountPayload, previewTotals, toLinePayload, type Discount, type EditLine } from '~/components/sales/CartLines.vue'
import type { PickedCustomer } from '~/components/sales/CustomerPicker.vue'
import type { MethodOption, PaymentPayload } from '~/components/sales/PaymentRows.vue'

definePageMeta({ layout: 'admin' })
useHead({ title: 'New manual order' })

const { can, me } = useStaff()
const { money } = useFormat()

const channel = ref<(typeof MANUAL_CHANNELS)[number]>('WHATSAPP')
const customer = ref<PickedCustomer | null>(null)
const contact = reactive({ name: '', phone: '', email: '', address: '' })
const lines = ref<EditLine[]>([])
const orderDiscount = ref<Discount | null>(null)
const fulfilmentType = ref<'PICKUP' | 'DELIVERY' | 'IN_STORE'>('PICKUP')
const customerNote = ref('')
const internalNote = ref('')
const assignedToId = ref<string>(me.value?.id ?? '')
const recordPayment = ref(false)
const payments = ref<PaymentPayload[]>([])
const idempotencyKey = newKey()

const { data: users } = useFetch('/api/admin/users', { server: false })
const { data: methodsData } = useFetch('/api/admin/payment-methods', { server: false })
const methods = computed<MethodOption[]>(() => (methodsData.value ?? []).filter(m => m.isActive && m.type !== 'EXCHANGE_CREDIT'))
const totals = computed(() => previewTotals(lines.value, orderDiscount.value))
const paymentRows = ref<{ missingRef: boolean } | null>(null)

function add(v: PickedVariant) {
  addVariant(lines.value, v)
}

const hasContact = computed(() => !!customer.value || !!contact.phone.trim() || !!contact.email.trim())
const valid = computed(() => lines.value.length > 0 && hasContact.value && !(recordPayment.value && paymentRows.value?.missingRef))

const { pending, run } = useAction()
async function submit() {
  if (!valid.value) return
  const order = await run(() => apiFetch<{ id: string }>('/api/admin/orders', {
    method: 'POST',
    body: {
      idempotencyKey,
      channel: channel.value,
      lines: toLinePayload(lines.value),
      orderDiscount: discountPayload(orderDiscount.value),
      customerId: customer.value?.id ?? null,
      contact: customer.value
        ? { name: customer.value.name, phone: customer.value.phone, email: customer.value.email ?? null, address: contact.address || null }
        : { name: contact.name || null, phone: contact.phone || null, email: contact.email || null, address: contact.address || null },
      fulfilmentType: fulfilmentType.value,
      customerNote: customerNote.value || null,
      internalNote: internalNote.value || null,
      assignedToId: assignedToId.value || null,
      payments: recordPayment.value ? payments.value : [],
    },
  }), { success: 'Order created — stock reserved' })
  if (order) await navigateTo(`/admin/orders/${order.id}`)
}
</script>

<template>
  <div>
    <UiPageHeader title="New manual order" subtitle="For customers who order through WhatsApp, Instagram, Facebook or by phone. Stock is reserved immediately." :crumbs="[{ label: 'Orders', to: '/admin/orders' }, { label: 'New manual order' }]" />

    <form class="grid grid-cols-1 gap-5 xl:grid-cols-[1.4fr_1fr]" @submit.prevent="submit">
      <div class="space-y-5">
        <UiCard title="Channel & customer">
          <div class="space-y-4">
            <div class="flex flex-wrap gap-2" role="radiogroup" aria-label="Sales channel">
              <button v-for="c in MANUAL_CHANNELS" :key="c" type="button" role="radio" :aria-checked="channel === c" class="h-10 rounded-full px-5 text-sm font-medium transition" :class="channel === c ? 'bg-ink text-white shadow-pill' : 'bg-sand-50 hover:bg-white'" @click="channel = c">{{ CHANNEL_LABELS[c] }}</button>
            </div>
            <SalesCustomerPicker v-model="customer" empty-label="New or existing customer" />
            <div v-if="!customer" class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <p class="text-xs text-ink-muted sm:col-span-2">Or enter contact details — an existing customer with the same phone/email is reused automatically.</p>
              <UiField id="c-name" label="Name"><input id="c-name" v-model="contact.name" class="field" maxlength="120"></UiField>
              <UiField id="c-phone" label="Phone"><input id="c-phone" v-model="contact.phone" class="field" type="tel" maxlength="30"></UiField>
              <UiField id="c-email" label="Email"><input id="c-email" v-model="contact.email" class="field" type="email" maxlength="120"></UiField>
            </div>
            <p v-if="!hasContact" class="text-xs text-caution">Choose a customer or enter a phone number or email.</p>
          </div>
        </UiCard>

        <UiCard title="Items">
          <AdminVariantPicker class="mb-3" @select="add" />
          <UiEmpty v-if="!lines.length" title="No items yet" message="Search by product name or SKU to add items." />
          <SalesCartLines v-else v-model="lines" :allow-discount="can('pos.discount')" :allow-override="can('pos.price.override')" />
          <UiField v-if="lines.length && can('pos.discount')" id="o-discount" label="Order discount" class="mt-3"><SalesDiscountInput id="o-discount" v-model="orderDiscount" /></UiField>
        </UiCard>

        <UiCard title="Fulfilment & notes">
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <UiField id="f-type" label="Fulfilment">
              <select id="f-type" v-model="fulfilmentType" class="field">
                <option value="PICKUP">Customer pickup</option>
                <option value="DELIVERY">Delivery (arranged separately)</option>
                <option value="IN_STORE">In store</option>
              </select>
            </UiField>
            <UiField id="assignee" label="Assigned to">
              <select id="assignee" v-model="assignedToId" class="field">
                <option value="">Unassigned</option>
                <option v-for="u in (users ?? []).filter(x => x.isActive)" :key="u.id" :value="u.id">{{ u.name }}</option>
              </select>
            </UiField>
            <UiField id="address" label="Delivery address / location" class="sm:col-span-2"><textarea id="address" v-model="contact.address" rows="2" class="field" maxlength="500" /></UiField>
            <UiField id="cnote" label="Customer note"><textarea id="cnote" v-model="customerNote" rows="2" class="field" maxlength="1000" /></UiField>
            <UiField id="inote" label="Internal note"><textarea id="inote" v-model="internalNote" rows="2" class="field" maxlength="1000" /></UiField>
          </div>
        </UiCard>
      </div>

      <div class="space-y-5">
        <div class="accent-card p-5">
          <dl class="space-y-1 text-sm text-white/90">
            <div class="flex justify-between"><dt>Subtotal</dt><dd class="num">{{ money(totals.subtotal) }}</dd></div>
            <div v-if="totals.discountTotal" class="flex justify-between"><dt>Discounts</dt><dd class="num">− {{ money(totals.discountTotal) }}</dd></div>
          </dl>
          <div class="mt-3 flex items-end justify-between"><span class="text-[13px]">Order total</span><span class="num text-[2rem] font-semibold leading-none">{{ money(totals.total) }}</span></div>
          <p class="mt-2 text-[11px] text-white/75">Preview — the server re-checks prices and stock.</p>
        </div>

        <UiCard v-if="can('payments.record')" title="Payment">
          <label class="flex items-start gap-2 text-sm">
            <input v-model="recordPayment" type="checkbox" class="mt-0.5 size-4 accent-ink">
            <span>Record a payment already received (e.g. M-Pesa code sent by the customer)</span>
          </label>
          <p v-if="!recordPayment" class="mt-2 text-xs text-ink-muted">The order will be created as unpaid. Payments can be recorded later from the order.</p>
          <SalesPaymentRows v-else ref="paymentRows" v-model:payments="payments" :methods="methods.filter(m => m.type !== 'CASH')" :due="totals.total" class="mt-3" />
        </UiCard>

        <UiButton type="submit" size="lg" block :loading="pending" :disabled="!valid">Create order</UiButton>
      </div>
    </form>
  </div>
</template>
