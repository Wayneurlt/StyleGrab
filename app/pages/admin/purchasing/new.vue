<script setup lang="ts">
definePageMeta({ layout: 'admin' })
useHead({ title: 'New purchase order' })

const { pending, run } = useAction()

async function create(payload: Record<string, unknown>) {
  const po = await run(() => apiFetch<{ id: string, number: string }>('/api/admin/purchase-orders', { method: 'POST', body: payload }), { success: 'Purchase order created as draft' })
  if (po) await navigateTo(`/admin/purchasing/${po.id}`)
}
</script>

<template>
  <div>
    <UiPageHeader title="New purchase order" subtitle="Draft an order to a supplier. Stock only changes when goods are received." :crumbs="[{ label: 'Purchasing', to: '/admin/purchasing' }, { label: 'New' }]" />
    <PurchasingPurchaseOrderForm submit-label="Save draft" :pending="pending" @submit="create" />
  </div>
</template>
