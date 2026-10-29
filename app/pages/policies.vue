<script setup lang="ts">
useSeoMeta({ title: 'Returns & policies', description: 'Returns, exchanges and payment policies.' })
const business = await useStoreInfo()
</script>

<template>
  <div class="glass-shell mx-auto max-w-3xl p-6 sm:p-10">
    <h1 class="text-3xl font-semibold tracking-tight">Returns &amp; policies</h1>
    <section class="mt-6 space-y-2">
      <h2 class="text-lg font-semibold">Returns and exchanges</h2>
      <p v-if="business?.returnPolicy" class="whitespace-pre-line text-ink-soft">{{ business.returnPolicy }}</p>
      <p v-else class="text-ink-soft">Please contact us about returns and exchanges.</p>
    </section>
    <section class="mt-6 space-y-2">
      <h2 class="text-lg font-semibold">Payments</h2>
      <p class="text-ink-soft">We do not take payment on this website. After you place an order, pay us directly using the instructions on your order page. Your order is marked paid only once our team has confirmed the payment.</p>
    </section>
    <section class="mt-6 space-y-2">
      <h2 class="text-lg font-semibold">Delivery and pickup</h2>
      <p class="text-ink-soft">Pickup and delivery are arranged by our team after you order. Any delivery charge is agreed with you before dispatch.</p>
    </section>
    <section v-if="business?.phone || business?.email" class="mt-6 space-y-2">
      <h2 class="text-lg font-semibold">Contact</h2>
      <p class="text-ink-soft"><template v-if="business.phone">{{ business.phone }}</template><template v-if="business.phone && business.email"> · </template><template v-if="business.email">{{ business.email }}</template></p>
    </section>
  </div>
</template>
