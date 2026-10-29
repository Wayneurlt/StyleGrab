<script setup lang="ts">
import { CheckCircle2 } from 'lucide-vue-next'

useSeoMeta({ title: 'Your order', robots: 'noindex' })
const route = useRoute()
const { money, date } = useFormat()
interface OrderView {
  number: string, status: string, paymentStatus: string, placedAt: string, total: number, amountPaid: number, amountRefunded: number
  contactName: string | null, reservationExpiresAt: string | null
  items: { productName: string, variantTitle: string, quantity: number, lineTotal: number }[]
  paymentMethods: { name: string, instructions: string | null }[]
  business: { name: string, phone: string, currency: string }
}
const { data: order, error } = await useFetch<OrderView>(() => String(`/api/store/orders/${route.params.number}`), { query: { key: route.query.key } })
</script>

<template>
  <div class="glass-shell mx-auto max-w-3xl p-5 sm:p-9">
    <div v-if="order">
      <div class="flex items-start gap-3">
        <CheckCircle2 class="mt-1 size-7 shrink-0 text-positive" />
        <div>
          <h1 class="text-3xl font-semibold tracking-tight">Order {{ order.number }}</h1>
          <p class="mt-1 text-ink-soft">Thank you, {{ order.contactName }}. Placed {{ date(order.placedAt) }}.</p>
        </div>
      </div>
      <div class="mt-5 flex flex-wrap gap-2">
        <UiStatusBadge kind="order" :value="order.status" />
        <UiStatusBadge kind="payment" :value="order.paymentStatus" />
      </div>

      <div class="glass-card mt-6 p-5">
        <ul class="space-y-2 text-sm">
          <li v-for="(i, idx) in order.items" :key="idx" class="flex justify-between gap-3"><span>{{ i.quantity }} × {{ i.productName }} <span class="text-ink-muted">({{ i.variantTitle }})</span></span><span class="num">{{ money(i.lineTotal) }}</span></li>
        </ul>
        <div class="mt-3 flex justify-between border-t border-sand-200 pt-3 font-semibold"><span>Total</span><span class="num">{{ money(order.total) }}</span></div>
        <div v-if="order.amountPaid" class="mt-1 flex justify-between text-sm text-ink-soft"><span>Payments confirmed</span><span class="num">{{ money(order.amountPaid - order.amountRefunded) }}</span></div>
      </div>

      <div v-if="order.status === 'PENDING' || (order.paymentStatus !== 'PAID' && order.status !== 'CANCELLED')" class="glass-card mt-4 p-5">
        <h2 class="font-medium">How to pay</h2>
        <p class="mt-1 text-sm text-ink-soft">Pay {{ order.business.name }} directly and use <b>{{ order.number }}</b> as the reference. Our team will confirm your order and record the payment.</p>
        <ul class="mt-3 space-y-2 text-sm">
          <li v-for="m in order.paymentMethods.filter(x => x.instructions)" :key="m.name" class="rounded-xl bg-sand-50 p-3"><b>{{ m.name }}:</b> {{ m.instructions }}</li>
        </ul>
        <p v-if="order.reservationExpiresAt" class="mt-3 text-xs text-ink-muted">Items are reserved for you until {{ date(order.reservationExpiresAt) }}. Unconfirmed orders are released after that.</p>
        <p v-if="order.business.phone" class="mt-2 text-xs text-ink-muted">Questions? Call or WhatsApp {{ order.business.phone }}.</p>
      </div>
      <div class="mt-6 flex flex-wrap gap-3">
        <UiButton to="/shop">Continue shopping</UiButton>
      </div>
    </div>
    <UiEmpty v-else title="Order not found" :message="error ? 'Use the link from your order confirmation, or contact us with your order number.' : ''"><UiButton to="/shop" variant="light">Back to the shop</UiButton></UiEmpty>
  </div>
</template>
